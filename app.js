

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



// divide a value in meters by this number to convert it to approximate
// degrees. one degree is approximately 111.12 kilometers or 111120 meters
METERS_TO_DEGREES = 111120;

// connect to postgres database
dbconnect = function() {
	if (process.env.GEOPAD_DATABASE_URL) {
		console.log("using process.env.GEOPAD_DATABASE_URL");
		var new_client = new pg.Client(process.env.GEOPAD_DATABASE_URL);
	} else {
		var new_client = new pg.Client({user: config.db_user, database: config.db_name, password: config.db_password});
	}
	new_client.connect(function(err) { if(err) {console.log(err);}});
	return new_client;
}

// create the express app
var pub = __dirname + '/media';

// setup middleware
var app = express();
app.use(app.router);
app.use(express.static(pub));
app.use(require('connect').bodyParser());
app.use(express.errorHandler());
app.use(express.favicon(__dirname + "/media/img/favicon.ico"));

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

// check for expired pads every hour on the 1st minute
hourly = '00 01 * * * *';
expiry_watch = new cronJob(hourly, function() {
	console.log("checking for expired pads... ");
	var client = dbconnect();
	var in_the_next_hour = new Date();
	in_the_next_hour.add({hours:1});
	expiring_query = "select active.uuid, pad_meta.expiry from pad_meta, active WHERE pad_meta.uuid = active.uuid AND pad_meta.expiry <= $1"; 
	expiring_args = [in_the_next_hour,];
	client.query(expiring_query, expiring_args, function(err, result) {
			if (result.rows.length > 0) {
				// create a one-off scheduled job for each pad this hour that
				// needs to be de-activated (also looks out for any
				// previously expired pads that were missed for any reason).
				var now = new Date();
				for (idx in result.rows) {
					pad = result.rows[idx];
					console.log("a pad expiring this hour:");
					console.log(pad);
					if (pad.expiry <= now ) {
						client.query("delete from active where uuid='" + pad.uuid + "';");
					} else {
						var at_expiry_time = pad.expiry;
						console.log("scheduling expiry of pad " + pad.uuid + " at " + at_expiry_time);
						new cronJob(at_expiry_time, function() {
							client.query("delete from active where uuid='" + pad.uuid + "';");
						}, true);
					}
				}
				console.log(now.toFormat("YYYY-MM-DDTHH24:MI:SS") + ": scheduled removal of " + result.rows.length + " pads from active list.");
			} else {
				console.log((new Date()).toFormat("YYYY-MM-DDTHH24:MI:SS") + ": no pads expired at this time.");
			}
			console.log("closing db client connection");
			client.end();
	});
}, null, true);


/* * * * * * * * * * * * * * * * * * * * * * 
 *				ROUTES					   *
 * * * * * * * * * * * * * * * * * * * * * */


app.get("/", function(req, res) {
	res.render('home');
});

app.get("/api/pads/nearby/", function(req, res) {
	// return pads where the current location falls within the covered area
	// (origin + radius)
	var client = dbconnect();
	var data = url.parse(req.url, true);
	console.dir("retrieving nearby pads with request data:");
	console.dir(data); 	

	client.query(
		"SELECT * FROM pad_meta INNER JOIN active ON pad_meta.uuid = active.uuid where ST_Intersects('POINT(" + data.query.user_lng + 
		" " + data.query.user_lat + ")'::geometry, area) ORDER BY created DESC;", function(err, result) {
		if (!err) {
			result.rows.forEach(function(item) {
				if (item.expiry) {
					item.expiry = item.expiry.toFormat("YYYY-MM-DDTHH24:MI:SS")
				}
			});
			app.render('snippets/pad_list', {pads: result.rows}, function(err, html) {
				console.log('retrieved nearby pads. sending list to client with user_id ' + data.query.user_id);
				io.sockets.in(data.query.user_id).emit('padlist', {"html": html, "pads": result.rows})
				client.end();
				res.send(200);
			})
		} else {
			console.log(err);
			client.end();
			res.send(500);
		}
	}); 
});

app.get("/api/post/new", function(req, res) {
	var client = dbconnect();
	var data = url.parse(req.url, true);
	console.log(data);
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

app.get("/api/pad/settings", function(req, res) {
	var client = dbconnect();
	var data = url.parse(req.url, true);
	console.log("in /api/pad/settings");
	console.log(data);

	//check if the user is an owner of the pad
	client.query("select exists (select * from membership where userid='"+ data.query.user_id +"' and padid='"+ data.query.pad_id+"' and owner=TRUE);", function(err, result) {
		if (!err && result.rows[0].exists != true) {
			console.log("error. user " + data.query.user_id + " is not an owner of pad " + data.query.pad_id + ".");
			res.send(500);
			console.log("#1 closing db client connection");
			client.end();
		} else if (err) {
			console.log("error querying ownership for pad:");
			console.log(err);
			res.send(500);
			console.log("#2 closing db client connection");
			client.end();
		}
	});
	
	// if we're good to go, update the pad
	var radius_meters = parseInt(data.query.radius);
	var radius_degrees = radius_meters/METERS_TO_DEGREES;

	if (data.query.expiry) {		
		var expiry_timestamp = new Date();
		expiry_timestamp.setHours(expiry_timestamp.getHours() + parseInt(data.query.expiry));
		console.log(expiry_timestamp);
	} else {
		var expiry_timestamp = null;
	}
		
	var padmeta_insert_string = "update pad_meta set (name, expiry, radius, area) = ($1, $2, $3, (SELECT ST_Buffer(origin, $4) from pad_meta where uuid=$5)) where uuid=$6 RETURNING name, radius, expiry";
	var padmeta_insert_args = [data.query.name, expiry_timestamp, radius_meters, radius_degrees, data.query.pad_id, data.query.pad_id]
	client.query(padmeta_insert_string, padmeta_insert_args, function(err, result) {
		if (!err) {
			if (result.rows[0].expiry != null) {
				pad_meta = {name: result.rows[0].name, radius: result.rows[0].radius, expiry: result.rows[0].expiry.toFormat("YYYY-MM-DDTHH24:MI:S")};
			} else {
				pad_meta = {name: result.rows[0].name, radius: result.rows[0].radius, expiry: result.rows[0].expiry}
			}
			socket.in(pad_meta.uuid).emit(pad_meta);
		} else { 
			console.log("error updating pad:");
			console.log(err);
			res.send(500);
		}
		console.log("#3 closing db client connection");
		client.end();
	});
});

app.get("/api/pad/new", function(req, res) {
	var client = dbconnect();
	console.log("in /api/pad/new/...");
	var data = url.parse(req.url, true);

	var default_radius_meters = 50;
	var default_expiry_hours = 24;
	
	var expiry_timestamp = new Date();
	expiry_timestamp.setHours(expiry_timestamp.getHours() + default_expiry_hours);
	console.log(expiry_timestamp);

	// because our lat and long are stored in degrees, we need to convert the
	// radius in degrees too. 
	var radius_degrees = default_radius_meters/METERS_TO_DEGREES;
	// we'll get pad metadata either from a newly created pad or an existing one. 
	var pad_meta;

	if (data.query.padid == "newpad") {
		// use a uuid for the table's primary key
		var the_uuid = uuid.v4().replace(/-/g,'');
		// create an entry in the pad metadata table for this pad
		var padmeta_insert_string = "INSERT INTO pad_meta (uuid, created, updated, name, origin, radius, area, expiry, creator) VALUES ($1, now(), now(), $2, ST_GeomFromText('POINT(" + data.query.user_lng + " " + data.query.user_lat + ")', 26910), $3, ST_Buffer(ST_GeomFromText('POINT(" + data.query.user_lng + " " + data.query.user_lat + ")'), $4), $5, $6) RETURNING name, uuid, creator, radius, expiry";
		var padmeta_insert_args = [the_uuid, "untitled", default_radius_meters, radius_degrees, expiry_timestamp, data.query.user_id]
			
		client.query(padmeta_insert_string, padmeta_insert_args, function(err, result) {
			if (!err) {
				pad_meta = {name: result.rows[0].name, uuid: result.rows[0].uuid, creator: result.rows[0].creator, radius: result.rows[0].radius, expiry: result.rows[0].expiry.toFormat("YYYY-MM-DDTHH24:MI:S")}
				console.log("result of insert:");
				console.log(result.rows[0]);

				// for new pads, update the membership table adding the creator as a pad owner
				var membership_insert_string = "INSERT INTO membership (padid, userid, owner) VALUES ($1, $2, TRUE)";
				var membership_insert_args = [pad_meta.uuid, pad_meta.creator];
				client.query(membership_insert_string, membership_insert_args, function(err, result) {
					if (err) {
						console.log("insert into membership table failed with the following output:");
						console.log(err);
						console.log("#1 closing db client connection");
						client.end();
					}
				});

				// create the table for this pad
				var table_name = "pad_" + the_uuid;
				var paddetail_insert_string = "CREATE TABLE IF NOT EXISTS "+ table_name +" (id SERIAL PRIMARY KEY, created TIMESTAMP, body TEXT, userid CHAR(32) )";
				client.query(paddetail_insert_string, function(err, result) {
					if (!err) {
						var active_insert_string = "INSERT INTO active (uuid) VALUES ($1)";
						var active_insert_args = [the_uuid];
						client.query(active_insert_string, active_insert_args, function(err, result) {
							if (err) {
								console.log("error inserting into table 'active'");
								console.log(err);
								console.log("#3 closing db client connection");
								client.end();
								res.send(500);
							}
						});
					} else {
						console.log("error creating table 'pad_" + the_uuid +"'");
						console.log(err);
						console.log("#4 closing db client connection");
						client.end();
						res.send(500);
					}
				});
			} else {
				console.log("error inserting into table 'pad_meta'");
				console.log(err);
				console.log("#5 closing db client connection");
				client.end();
				res.send(500);
			}
		});
	} else {
		client.query("select name, uuid, creator, radius, expiry from pad_meta where uuid='" + the_uuid + "'", function(err, result) {
			if (!err) {
				pad_meta = {name: result.rows[0].name, uuid: result.rows[0].uuid, creator: result.rows[0].creator, radius: result.rows[0].radius, expiry: result.rows[0].expiry.toFormat("YYYY-MM-DDTHH24:MI:S")};
			} else {
				console.log("error selecting from table 'pad_meta'");
				console.log(err);
				console.log("#6 closing db client connection");
				client.end();
				res.send(500);
			}
		});
	}

	// add the post content to the new/selected pad
	var the_uuid = data.query.pad;

	var post_insert_string = "INSERT INTO pad_"+ the_uuid +"(created, body, userid) VALUES (now(), $1, $2) RETURNING id, created, body, userid";
	var post_insert_args = [data.query.post, data.query.user_id];
	client.query(post_insert_string, post_insert_args, function(err, result) {
		if (!err) {
			res.render('snippets/pad_meta', {pad: pad_meta}, function(err, html) {
				console.log("pad created. html being sent:");
				console.log(html);
				// notify other clients on the homepage of the new pad
				io.sockets.in('home').emit('newpad-notify', html);
			});				
			// redirect the client that created the pad to the pad page
			res.redirect('/pad/'+ pad_meta.uuid + '/');
		} else {
			console.log(err);
			res.send(500);
		}
		console.log("#2 closing db client connection");
		client.end();
	});
})

// must go *after* the /api/pad/new due to regex matching
app.get("/pad/:padid", function(req, res) {
	var client = dbconnect();
	var padid = req.params.padid;
	console.log("retrieving pad " + padid);
	client.query("select uuid, created, creator, updated, name, ST_AsText(origin), radius, expiry, salt, password from pad_meta where uuid='"+ padid +"'", function (err, result) {
		if (!err) {
			// lazily assumes the row actually IS unique since it's supposed to
			// be a UUID (should really double check). 
			var pad = result.rows[0];
			if (pad.expiry) {
				pad.expiry = pad.expiry.toFormat("YYYY-MM-DDTHH24:MI:SS");
			}
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
				console.log("#1 closing db client connection");
				client.end();
			});

		} else {
			// probably, pad does not exist
			console.log(err);
			res.send(500);
			console.log("#2 closing db client connection");
			client.end();
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
		socket.in(room_name).emit('join-success-'+room_name)
	});
	socket.on('owner-query', function(data) {
		var client = dbconnect();
		client.query("select exists (select * from membership where userid='"+ data.user_id +"' and padid='"+ data.pad_id+"' and owner=TRUE);", function(err, result) {
			if (!err && result.rows[0].exists == true) {
				socket.in(data.user_id).emit('owner-proclaim');
			} else if (err) {
				console.log("error querying ownership for pad:");
				console.log(err);
			}
			console.log("closing db client connection");
			client.end();
		});
	});

});


/************************************************ 
*
*					get the party started
*
*************************************************/

console.log("geopad server listening on port 3000");

