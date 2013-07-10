

var express = require('express');
var pg = require('pg');
var url = require('url'); // hack to workaround non-working POST request
var dateutils = require('date-utils');
var uuid = require('node-uuid');
var config = require('./config.js')
var cronJob = require('cron').CronJob;

/* * * * * * * * * * * * * * * * * * * * * * 
 *				APP SETUP				   *
 * * * * * * * * * * * * * * * * * * * * * */


// connect to postgres database
if (process.env.GEOPAD_DATABASE_URL) {
	console.log("using process.env.GEOPAD_DATABASE_URL");
	var client = new pg.Client(process.env.GEOPAD_DATABASE_URL);
} else {
	var client = new pg.Client({user: config.db_user, database: config.db_name, password: config.db_password});
}
client.connect(function(err) { if(err) {console.log(err);}});

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
io.set('log level', 2);
server.listen(3000); 

// set default template engine to jade (note that express defaults to looking
// for view files in views/ directory under CWD, but set it here explicitly
// for clarity).
app.set('views', __dirname + '/views');
app.set("view engine", "jade");

// make the domain available to all templates (for connecting sockets)
app.locals.domain = config.domain;

/* * * * * * * * * * * * * * * * * * * * * * 
 *				TASKS					   *
 * * * * * * * * * * * * * * * * * * * * * */

// check for expired pads every hour on the 7th minute
hourly = '* 7 * * * *';
expiry_watch = new cronJob(hourly, function() {
	console.log("checking for expired pads... ");
	client.query(
		"delete from active USING pad_meta WHERE pad_meta.uuid = active.uuid " + 
		"AND pad_meta.expiry <= now() RETURNING active.uuid;", function(err, result) {
			if (result.rows.length > 0) {
				console.log("removed the following " + result.rows.length + " pads from active list:");
				console.log(result.rows);
			} else {
				console.log("no pads expired at this time.");
			}
	});
}, null, true);


/* * * * * * * * * * * * * * * * * * * * * * 
 *				ROUTES					   *
 * * * * * * * * * * * * * * * * * * * * * */


app.get("/", function(req, res) {
	res.render('home');
});

app.get("/api/pads/nearby/", function(req, res) {
	// return pads where the current location falls within the covered area  (origin + radius)
	var data = url.parse(req.url, true);
	console.dir(data); 	

	client.query(
		"SELECT * FROM pad_meta INNER JOIN active ON " + 
		"pad_meta.uuid = active.uuid where " + 
		"ST_Intersects('POINT(" + data.query.user_long + 
		" " + data.query.user_lat + ")'::geometry, area) ORDER BY " + 
		"created DESC;", function(err, result) {
			app.render('snippets/pad_list', {pads: result.rows}, function(err, html) {
			console.log('retrieved nearby pads. sending list to ' + io.sockets.clients('home').length + ' connected clients');
			io.sockets.in('home').emit('padlist', html)
			res.send(200);
		})
	}); 
});

app.get("/api/post/new", function(req, res) {
	var data = url.parse(req.url, true);
	var pad_id = data.query.pad_id;
	var post_body = data.query.post_body;
	var user_id = data.query.user_id;
	var post_insert_string = "INSERT INTO pad_"+ pad_id +"(created, body, userid) VALUES (now(), $1, $2) RETURNING id, created, body, userid";
	var post_insert_args = [post_body, user_id];
	client.query(post_insert_string, post_insert_args, function(err, result) {
		if (!err) {
			app.render("snippets/post_detail", {post: result.rows[0] }, function(err, html) {
				io.sockets.in(pad_id).emit('newpost-notify', html);
				// need to close out the http request
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
	var radius_meters = parseInt(data.query.pad_radius);
	// because our lat and long are stored in degrees, we need to convert the
	// radius in degrees too. one degree is approximately 111.12 kilometers or
	// 111120 meters
	var radius_degrees = radius_meters/111120;
	// use a uuid for the table's primary key
	var the_uuid = uuid.v4().replace(/-/g,'');
	if (data.query.pad_expiry) {		
		var expiry_timestamp = new Date();
		expiry_timestamp.setHours(expiry_timestamp.getHours() + parseInt(data.query.pad_expiry));
		console.log(expiry_timestamp);
		var padmeta_insert_string = "INSERT INTO pad_meta (uuid, created, updated, name, origin, radius, area, expiry) VALUES ($1, now(), now(), $2, ST_GeomFromText('POINT(" + data.query.user_long + " " + data.query.user_lat + ")', 26910), $3, ST_Buffer(ST_GeomFromText('POINT(" + data.query.user_long + " " + data.query.user_lat + ")'), $4), $5) RETURNING name, uuid, radius, expiry";
		var padmeta_insert_args = [the_uuid, data.query.pad_name, radius_meters, radius_degrees, expiry_timestamp]
	} else {
		var padmeta_insert_string = "INSERT INTO pad_meta (uuid, created, updated, name, origin, radius, area) VALUES ($1, now(), now(), $2, ST_GeomFromText('POINT(" + data.query.user_long + " " + data.query.user_lat + ")', 26910), $3, ST_Buffer(ST_GeomFromText('POINT(" + data.query.user_long + " " + data.query.user_lat + ")'), $4)) RETURNING name, uuid, radius, expiry";
		var padmeta_insert_args = [the_uuid, data.query.pad_name, radius_meters, radius_degrees]
	}
		
		client.query(padmeta_insert_string, padmeta_insert_args, function(err, result) {
			if (!err) {
				console.log("result of insert:");
				console.log(result.rows[0]);
				var pad_meta = {name: result.rows[0].name, uuid: result.rows[0].uuid, radius: result.rows[0].radius, expiry: result.rows[0].expiry}
				var table_name = "pad_" + the_uuid;
				var paddetail_insert_string = "CREATE TABLE IF NOT EXISTS "+ table_name +" (id SERIAL PRIMARY KEY, created TIMESTAMP, body TEXT, userid CHAR(32) )";
				client.query(paddetail_insert_string, function(err, result) {
					if (!err) {
						var active_insert_string = "INSERT INTO active (uuid) VALUES ($1)";
						var active_insert_args = [the_uuid];
						client.query(active_insert_string, active_insert_args, function(err, result) {
							if (!err) {
								res.render('snippets/pad_meta', {pad: pad_meta}, function(err, html) {
									console.log("pad created. html being sent:");
									console.log(html);
									io.sockets.in('home').emit('newpad-notify', html);
									res.send(200);
								});				
							} else {
								console.log("error inserting into table 'active'");
								console.log(err);
								res.send(500);
							}
						});
					} else {
						console.log("error creating table 'pad_" + the_uuid +"'");
						console.log(err);
						res.send(500);
					}
				});
			} else {
				console.log("error inserting into table 'pad_meta'");
				console.log(err);
				res.send(500);
			}
		});
})

// must go *after* the /api/pad/new due to regex matching
app.get("/pad/:padid", function(req, res) {
	var padid = req.params.padid;
	console.log("retrieving pad " + padid);
	client.query("select uuid, created, updated, name, ST_AsText(origin), radius, expiry, salt, password from pad_meta where uuid='"+ padid +"'", function (err, result) {
		if (!err) {
			// lazily assumes the row actually IS unique since it's supposed to
			// be a UUID (should really double check). 
			var pad = result.rows[0];
			console.log("obtained pad metadata:");
			console.log(pad);
			client.query("SELECT * FROM pad_" + padid + " ORDER BY created DESC;", function(err, result) {
				if (!err) {
					var posts = result.rows;
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
	socket.on('join', function(room_name) {
		console.log('client joining ' + room_name);
		socket.join(room_name);
	});
});


/************************************************ 
*
*					get the party started
*
*************************************************/

console.log("geopad server listening on port 3000");

