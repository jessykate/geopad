var user_lat, user_long;

geo_success = function(position) {
	// save the user's position as a global variable 
	user_lat = position.coords.latitude;
	user_long = position.coords.longitude;
	accuracy = position.coords.accuracy;
	console.log("obtained user location (" + user_lat + "," + user_long + ") to accuracy of " + accuracy);
	location_error = false;

	// get or create the user's identity
	if (!localStorage["geopad_username"]) {
		localStorage["geopad_username"] = "mirandah";
	}
	username = localStorage["geopad_username"];

	// once we know location, retrieve the relevant pads (response is sent via
	// sockets, not ajax, so there is no response code here.)
	request = $.ajax({
		data: {user_lat: user_lat, user_long: user_long},
		type: "GET",
		contentType: "application/json",
		url: "/api/pads/nearby/"
	});
};

geo_error = function(error) {
	console.log("Error, could not obtain location. Error " + error.code);
	location_error = true;
};

navigator.geolocation.watchPosition(
	geo_success, 
	geo_error, 
	{enableHighAccuracy:true}
);

