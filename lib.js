
module.exports = {
	add_post_to_pad: function(client, data, pad_meta, io, res) {
		the_uuid = pad_meta.uuid;
		console.log("working with uuid = " + the_uuid);

		// add the post content to the new/selected pad
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
				console.log("error inserting into pad table pad_" + the_uuid);
				console.log(err);
				res.send(500);
			}
			console.log("#2 closing db client connection");
			client.end();
		});
	}
// end of exports
};
