

retrieve_nearby_pads = function(user_lat, user_long) {
	// now that we know the location and have joined the room,
	// retrieve nearby pads (response is sent via sockets,
	// not ajax, so there is no response code here.)
	request = $.ajax({
		data: {user_lat: user_lat, user_long: user_long},
		type: "GET",
		contentType: "application/json",
		url: "/api/pads/nearby/"
	});
};

