

var express = require('express');
var pg = require('pg');
var url = require('url'); // hack to workaround non-working POST request
var dateutils = require('date-utils');

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

	var query = client.query("SELECT * FROM pads_meta where ST_Intersects('POINT("+ data.query.user_long + " " + data.query.user_lat + ")'::geometry, area);", function(err, result) {
		res.render('snippets/pad_list', {pads: result.rows})
	}); 
})

// this is written as a GET request currently because the POST request with
// express.js seemed b0rked.
app.get("/api/pad/new", function(req, res) {
	var data = url.parse(req.url, true);
	console.dir(data); 
	// one degree is approximately 111.12 kilometers or 111120 meters
	radius_meters = parseInt(data.query.pad_radius);
	radius_degrees = radius_meters/111120;
	if (data.query.pad_expiry) {		
		expiry_timestamp = new Date();
		//expiry_timestamp.add({hours: data.query.pad_expiry}); 
		expiry_timestamp.setHours(expiry_timestamp.getHours() + parseInt(data.query.pad_expiry));
		console.log(expiry_timestamp);
		insert_string = "INSERT INTO pads_meta (created, updated, name, origin, radius, area, expiry) VALUES (now(), now(), $1, ST_GeomFromText('POINT(" + data.query.user_long + " " + data.query.user_lat + ")', 26910), $2, ST_Buffer(ST_GeomFromText('POINT(" + data.query.user_long + " " + data.query.user_lat + ")'), $3), $4)";
		insert_args = [data.query.pad_name, radius_meters, radius_degrees, expiry_timestamp]
		pad_meta = {name: data.query.pad_name, radius: radius_meters, expiry: expiry_timestamp}
	} else {
		insert_string = "INSERT INTO pads_meta (created, updated, name, origin, radius, area) VALUES (now(), now(), $1, ST_GeomFromText('POINT(" + data.query.user_long + " " + data.query.user_lat + ")', 26910), $2, ST_Buffer(ST_GeomFromText('POINT(" + data.query.user_long + " " + data.query.user_lat + ")'), $3))";
		insert_args = [data.query.pad_name, radius_meters, radius_degrees]
		pad_meta = {name: data.query.pad_name, radius: radius_meters, expiry: null}
	}
		client.query(insert_string, insert_args, function(err, result) {
			console.log("error:");
			console.log(err);
			console.log("result:");
			console.log(result);
			if (!err) {
				res.render('snippets/pad_meta', {pad: pad_meta})				
			} else {
				res.send(500, "<div class='error-msg'>There was a problem creating your pad, please try again.</div>");
			}
		});
})

app.listen(3000);
console.log("geopad server listening on port 3000");

