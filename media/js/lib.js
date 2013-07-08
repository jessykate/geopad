

retrieve_nearby_pads = function(user_lat, user_long) {
	// now that we know the location and have joined the room,
	// retrieve nearby pads (response is sent via sockets,
	// not ajax, so there is no response code here.)

	// wire up the ajax-y spinning animated GIF when an ajax call is made.
	$('#spinner').ajaxStart(function () {
		$(this).fadeIn('fast');
	}).ajaxStop(function() { 
		$("#spinner").stop().fadeOut('fast');
	});

	request = $.ajax({
		data: {user_lat: user_lat, user_long: user_long},
		type: "GET",
		contentType: "application/json",
		url: "/api/pads/nearby/"
	});
};

