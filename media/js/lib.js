function page_global_vars() { 
	this.user_corrected_lat = null; 
	this.user_corrected_lng = null;
	// initialize map variables
	this.map = L.map('user-map');
	this.user_location_marker= L.marker();
	// load any known user position tweaks from session storage
	this.user_delta_lat = null;
	this.user_delta_lng = null;

	L.tileLayer('http://a.tile.stamen.com/toner/{z}/{x}/{y}.png', {
		attribution: 'Tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>& <a href="http://openstreetmap.org">OpenStreetMap</a>' }).addTo(this.map);
}

/* Functions that take the latitude or longitude, and an error
* value (positive error for easterly/northerly direction,
* negative value for westerly/southerly) and calculates the
* bound on the location accuracy in a lat/long
* coordinate-system aware manner (ie, a latitude of +175
* degrees with an easterly error of +10 would return a value of
* -5 for the easterly bound.  */
lng_bnd = function(lng, err) { x = ((lng + 180) + err) % 360 - 180; return x; };
lat_bnd = function(lat, err) { x = ((lat + 90) + err) % 180 - 90; return x; };

update_user_position_with_tweaks = function(position, page_vars) {
	// save or update the user's position.
	// save both the original position returned by the geolocation
	// API and the delta refinement specified by the user. to begin
	// with, of course, the two positions are the same, and the
	// user_delta is 0. saving the user_delta allows us to propagate the user's
	// corrections continuously whenever the geolocation API refreshes their
	// location. 

	// every time the geolocation api updates, add the user's
	// tweaks to the position. 
	page_vars.user_corrected_lat = lat_bnd(position.coords.latitude, page_vars.user_delta_lat);
	page_vars.user_corrected_lng = lng_bnd(position.coords.longitude, page_vars.user_delta_lng);

};

load_saved_user_position_tweaks = function(page_vars) {
	page_vars.user_delta_lat = parseFloat(sessionStorage.user_delta_lat || 0);
	page_vars.user_delta_lng = parseFloat(sessionStorage.user_delta_lng || 0);
};

update_map = function(accuracy, page_vars) {

	// use the accuracy parameter of the geolocation API to
	// calculate rough bounds on the location, and convert this to
	// an error in degrees. Add 100 meters for flexibility and
	// convert these to bounds on the map. . 
	var flexibility_factor = 100;
	var accuracy_degrees = (accuracy + flexibility_factor)/111120;
	console.log("accuracy_degrees: " + accuracy_degrees);
	var southWestBound = new L.LatLng(lat_bnd(page_vars.user_corrected_lat, -accuracy_degrees), lng_bnd(page_vars.user_corrected_lng, -accuracy_degrees));
	var northEastBound = new L.LatLng(lat_bnd(page_vars.user_corrected_lat, accuracy_degrees), lng_bnd(page_vars.user_corrected_lng, accuracy_degrees));
	console.log('southwest bound: ' + southWestBound);
	console.log('northeast bound: ' + northEastBound);
	var user_position_uncertainty = new L.LatLngBounds(southWestBound, northEastBound);

	page_vars.map.setView([page_vars.user_corrected_lat, page_vars.user_corrected_lng], 15);
	page_vars.map.setMaxBounds(user_position_uncertainty);

	// remove the old marker and generate a new one. (XXX should be a better way to do this!)
	page_vars.map.removeLayer(page_vars.user_location_marker);
	page_vars.user_location_marker = L.marker(
		[page_vars.user_corrected_lat, page_vars.user_corrected_lng], 
		{draggable: true}
	).addTo(page_vars.map);

	page_vars.user_location_marker.bindPopup("Drag the pin to<br>fine-tune your<br>location.").openPopup();
	page_vars.user_location_marker.on('dragend', function(event) {
		var updated_latlng = event.target.getLatLng();
		var new_user_delta_lat = updated_latlng.lat - page_vars.user_corrected_lat;
		var new_user_delta_lng = updated_latlng.lng - page_vars.user_corrected_lng;
		// update the session storage value
		sessionStorage.user_delta_lat = new_user_delta_lat;
		sessionStorage.user_delta_lng = new_user_delta_lng;

		// update the actual user position values used for
		// calculations, new pad creation, etc. 
		page_vars.user_corrected_lat = updated_latlng.lat;
		page_vars.user_corrected_lng = updated_latlng.lng;

		// this has to be inside this callback! in order to be triggered by the
		// dragging of the location marker
		retrieve_nearby_pads(page_vars.user_corrected_lat, page_vars.user_corrected_lng);
		console.log('updated user position to: ' + page_vars.user_corrected_lat + ", " + page_vars.user_corrected_lng);
	})

};

/* Once we know the location and have joined the socket room through which the
 * response will be sent, nearby pads can be retrieved (response is sent via
 * sockets, not ajax, so there is no response code here.) */
retrieve_nearby_pads = function(user_corrected_lat, user_corrected_lng) {
	// wire up the ajax-y spinning animated GIF when an ajax call is made.
	$('#spinner').ajaxStart(function () {
		$(this).fadeIn('fast');
	}).ajaxStop(function() { 
		$("#spinner").stop().fadeOut('fast');
	});

	window.alert("inside function: retrieving nearby pads...");
	console.log("retrieving nearby pads...");
	request = $.ajax({
		data: {user_lat: user_corrected_lat, user_lng: user_corrected_lng, user_id: localStorage.geopad_userid},
		type: "GET",
		contentType: "application/json",
		url: "/api/pads/nearby/"
	});
};


get_or_create_random_identity = function() {
	if (!localStorage["geopad_userid"]) {
		var userid = uuid.v4().replace(/-/g,'');
		var user_avatar_url = "http://www.gravatar.com/avatar/"+ userid +"?d=monsterid"
		localStorage["geopad_userid"] = userid;
		localStorage["geopad_avatar"] = user_avatar_url

	}
}

// called every time the geolocation api succeeds
geo_success_callback = function(position, page_vars) {

	update_user_position_with_tweaks(position, page_vars);
	
	// logging
	console.log("raw geolocation position: " + position.coords.latitude, position.coords.longitude);
	console.log("user deltas: " + page_vars.user_delta_lat + ", " + page_vars.user_delta_lng);
	console.log("corrected user location set to (" + page_vars.user_corrected_lat + "," + page_vars.user_corrected_lng + ") to accuracy of " + position.coords.accuracy);

	// Update the displayed map by retricting it to bounds roughly
	// representing the accuracy (or inaccuracy) of the user-specified
	// position.
	update_map(position.coords.accuracy, page_vars);

};

geo_error = function(error) {
	console.log("Error, could not obtain location. Error " + error.code);
};

// called once from the calling page
geolocation_launch = function(connections_setup_fn, page_vars) {

	load_saved_user_position_tweaks(page_vars);

	// the geo_success callback given to the geolocation API passes the
	// position object by default. we need to pass in more arguments, so these
	// wrappers do the trick. 
	geo_success_initial = function(position) {
		// update the user position and map
		geo_success_callback(position, page_vars);
		// set up the local page connections
		connections_setup_fn(page_vars.user_corrected_lat, page_vars.user_corrected_lng);
	};
	geo_success_subsequent = function(position) {
		geo_success_callback(position, page_vars);
	};

	// initially just get the position once, and then set a watch for
	// updates. this allows for callbacks that need to be called only
	// once, after the position has been determined. 
	navigator.geolocation.getCurrentPosition(
		geo_success_initial,
		geo_error,
		{enableHighAccuracy:true}
	);

	var watch_id = navigator.geolocation.watchPosition(
		geo_success_subsequent, 
		geo_error, 
		{enableHighAccuracy:true}
	);
	
};



padsort_recent_activity = function() {
};

padsort_popularity = function() {
};

padsort_created = function() {
};

