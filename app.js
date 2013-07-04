

var express = require('express');
var pg = require('pg');
var url = require('url'); // hack to workaround non-working POST request
var dateutils = require('date-utils');
var uuid = require('node-uuid');

var connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/geopad'

// connect to postgres database
var client = new pg.Client(connectionString);
client.connect();

// create the express app
var pub = __dirname + '/media';

// setup middleware
var app = express();
app.use(app.router);
app.use(express.static(pub));
app.use(require('connect').bodyParser());
app.use(express.errorHandler());

var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
server.listen(3000); 

// set default template engine to jade (note that express defaults to looking
// for view files in views/ directory under CWD, but set it here explicitly
// for clarity).
app.set('views', __dirname + '/views');
app.set("view engine", "jade");

// routes

app.get("/", function(req, res) {
	res.render('home')
});

app.get("/api/pads/nearby/", function(req, res) {
	// return pads where the current location falls within the covered area  (origin + radius)
	var data = url.parse(req.url, true);
	console.dir(data); 	

	var query = client.query("SELECT * FROM pad_meta where ST_Intersects('POINT("+ data.query.user_long + " " + data.query.user_lat + ")'::geometry, area);", function(err, result) {
		res.render('snippets/pad_list', {pads: result.rows})
	}); 
});

app.get("/api/post/new", function(req, res) {
	var data = url.parse(req.url, true);
	pad_id = data.query.pad_id;
	post_body = data.query.post_body;
	post_insert_string = "INSERT INTO pad_"+ pad_id +"(created, body) VALUES (now(), $1) RETURNING id, created, body";
	post_insert_args = [post_body,];
	client.query(post_insert_string, post_insert_args, function(err, result) {
		if (!err) {
			res.render("snippets/post_detail", {post: result.rows[0] }, function(err, html) {
				io.sockets.emit('newpost-notify', html);
				res.send(200);
			});				
		} else {
			console.log(err);
			res.send(500);
		}
	});
});

app.get("/api/pad/new", function(req, res) {

	var data = url.parse(req.url, true);
	radius_meters = parseInt(data.query.pad_radius);
	// because our lat and long are stored in degrees, we need to convert the
	// radius in degrees too. one degree is approximately 111.12 kilometers or
	// 111120 meters
	radius_degrees = radius_meters/111120;
	// use a uuid for the table's primary key
	the_uuid = uuid.v4().replace(/-/g,'');
	if (data.query.pad_expiry) {		
		expiry_timestamp = new Date();
		expiry_timestamp.setHours(expiry_timestamp.getHours() + parseInt(data.query.pad_expiry));
		console.log(expiry_timestamp);
		padmeta_insert_string = "INSERT INTO pad_meta (uuid, created, updated, name, origin, radius, area, expiry) VALUES ($1, now(), now(), $2, ST_GeomFromText('POINT(" + data.query.user_long + " " + data.query.user_lat + ")', 26910), $3, ST_Buffer(ST_GeomFromText('POINT(" + data.query.user_long + " " + data.query.user_lat + ")'), $4), $5) RETURNING name, uuid, radius, expiry";
		padmeta_insert_args = [the_uuid, data.query.pad_name, radius_meters, radius_degrees, expiry_timestamp]
	} else {
		padmeta_insert_string = "INSERT INTO pad_meta (uuid, created, updated, name, origin, radius, area) VALUES ($1, now(), now(), $2, ST_GeomFromText('POINT(" + data.query.user_long + " " + data.query.user_lat + ")', 26910), $3, ST_Buffer(ST_GeomFromText('POINT(" + data.query.user_long + " " + data.query.user_lat + ")'), $4)) RETURNING name, uuid, radius, expiry";
		padmeta_insert_args = [the_uuid, data.query.pad_name, radius_meters, radius_degrees]
	}
		
		client.query(padmeta_insert_string, padmeta_insert_args, function(err, result) {
			if (!err) {
				console.log(result);
				pad_meta = {name: result.rows[0].name, uuid: result.rows[0].uuid, radius: result.rows[0].radius, expiry: result.rows[0].expiry}
				table_name = "pad_" + the_uuid;
				paddetail_insert_string = "CREATE TABLE IF NOT EXISTS "+ table_name +" (id SERIAL PRIMARY KEY, created TIMESTAMP, body TEXT, userid CHAR(32) )";
				client.query(paddetail_insert_string, function(err, result) {
					res.render('snippets/pad_meta', {pad: pad_meta}, function(err, html) {
						io.sockets.emit('newpad-notify', html);
						res.send(200);
					});				
				});
			} else {
				console.log(err);
				res.send(500);
			}
		});
})

// must go *after* the /api/pad/new due to regex matching
app.get("/pad/:padid", function(req, res) {
	padid = req.params.padid;
	console.log("retrieving pad " + padid);
	client.query("select uuid, created, updated, name, ST_AsText(origin), radius, expiry, salt, password from pad_meta where uuid='"+ padid +"'", function (err, result) {
		if (!err) {
			// lazily assumed the row actually IS unique since it's supposed to
			// be a UUID (should really double check). 
			pad = result.rows[0];
			console.log("obtained pad metadata:");
			console.log(pad);
			client.query("SELECT * FROM pad_" + padid + " ORDER BY created DESC;", function(err, result) {
				if (!err) {
					posts = result.rows;
					res.render('paddetail', {pad: pad, posts: posts});
				} else {
					console.log(err);
					res.send(500);
				}
			});

		} else {
			// probably, pad does not exist
			console.log(err);
			res.send(500);
		}

	});
});



/************************************************ 
*
*					socketsessss
*
*************************************************/

io.sockets.on('connection', function(socket) {
	console.log("socket connected");
});


/************************************************ 
*
*					get the party started
*
*************************************************/

console.log("geopad server listening on port 3000");

