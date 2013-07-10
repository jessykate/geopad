

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

/* functions that take the latitude or longitude, and an error
* value (positive error for easterly/northerly direction,
* negative value for westerly/southerly) and calculates the
* bound on the location accuracy in a lat/long
* coordinate-system aware manner (ie, a latitude of +175
* degrees with an easterly error of +10 would return a value of
* -5 for the easterly bound.  */
lng_bnd = function(lng, err) { x = ((lng + 180) + err) % 360 - 180; return x; };
lat_bnd = function(lat, err) { x = ((lat + 90) + err) % 180 - 90; return x; };

