function page_global_vars() { 
	// initialize map variables

	this.geoPadIcon = L.icon({
		    iconUrl: '/img/marker-icon-2x.png',
		    shadowUrl: '/img/marker-shadow.png',
		    popupAnchor:  [25, 0] // point from which the popup should open relative to the iconAnchor
	});

	this.user_lat = null;
	this.user_lng = null;
	this.map = L.map('user-map');
	this.user_location_marker= L.marker();
	this.map.scrollWheelZoom.disable();
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

map_setup = function(position, page_vars) {

	/* if we want to limit the map bounds, uncomment these lines
		// use the accuracy parameter of the geolocation API to
		// calculate rough bounds on the location, and convert this to
		// an error in degrees. Add some number of meters for flexibility and
		// convert these to bounds on the map. 
		var flexibility_factor = 200;
		var accuracy_degrees = (position.accuracy + flexibility_factor)/111120;
		console.log("accuracy_degrees: " + accuracy_degrees);
		var southWestBound = new L.LatLng(lat_bnd(page_vars.user_lat, -accuracy_degrees), lng_bnd(page_vars.user_lng, -accuracy_degrees));
		var northEastBound = new L.LatLng(lat_bnd(page_vars.user_lat, accuracy_degrees), lng_bnd(page_vars.user_lng, accuracy_degrees));
		var user_position_uncertainty = new L.LatLngBounds(southWestBound, northEastBound);
	*/

	page_vars.map.setView([position.coords.latitude, position.coords.longitude], 18);
	//page_vars.map.setMaxBounds(user_position_uncertainty);

	// who knows why but the leaflet coordinate system seems to start from the
	// bottom right. le sigh. 
	var x_offset = page_vars.map.getSize().x - 100;
	var y_offset = page_vars.map.getSize().y - 150;
	var div_offset = page_vars.map.containerPointToLatLng(
			new L.Point(x_offset, y_offset));
	console.log("div offset is:");
	console.log(div_offset);
	page_vars.map.panTo(div_offset, 18);

	// remove the old marker and generate a new one. (XXX should be a better way to do this!)
	page_vars.map.removeLayer(page_vars.user_location_marker);
	page_vars.user_location_marker = L.marker(
		[position.coords.latitude, position.coords.longitude], 
		{draggable: true, icon: page_vars.geoPadIcon}
	).addTo(page_vars.map);

	page_vars.user_location_marker.bindPopup("Drag the pin to fine-tune<br>your location, and browse or<br>create nearby pads.").openPopup();
	page_vars.user_location_marker.on('dragend', function(event) {
		var new_loc = event.target.getLatLng();
		page_vars.user_lat = new_loc.lat;
		page_vars.user_lng = new_loc.lng;

		// re-open the marker popup
		page_vars.user_location_marker.openPopup();
		// this has to be inside this callback! in order to be triggered by the
		// dragging of the location marker
		retrieve_nearby_pads(new_loc.lat, new_loc.lng);
		console.log('updated user position to: ' + new_loc.lat + ", " + new_loc.lng);
	})

};

/* Once we know the location and have joined the socket room through which the
 * response will be sent, nearby pads can be retrieved (response is sent via
 * sockets, not ajax, so there is no response code here.) */
retrieve_nearby_pads = function(user_lat, user_lng) {
	// wire up the ajax-y spinning animated GIF when an ajax call is made.
	$('#spinner').ajaxStart(function () {
		$(this).fadeIn('fast');
	}).ajaxStop(function() { 
		$("#spinner").stop().fadeOut('fast');
	});

	console.log("retrieving nearby pads...");
	request = $.ajax({
		data: {user_lat: user_lat, user_lng: user_lng, user_id: localStorage.geopad_userid},
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

geo_success_callback = function(position, page_vars) {
	page_vars.user_lat = position.coords.latitude;
	page_vars.user_lng = position.coords.longitude;
	console.log("initial user position obtained: " + page_vars.user_lat, page_vars.user_lng);
	map_setup(position, page_vars);
};

geo_error = function(error) {
	console.log("Error, could not obtain location. Error " + error.code);
};

// called once from the calling page
geolocation_launch = function(connections_setup_fn, page_vars) {

	/* the geo_success callback given to the geolocation API passes the
	 position object by default. we need to pass in more arguments, so these
	 wrappers do the trick.  */
	geo_success_initial = function(position) {
		// set the user position and initialize the map
		geo_success_callback(position, page_vars);
		// set up the local page socket connections and callbacks
		connections_setup_fn(page_vars.user_lat, page_vars.user_lng);
	};

	// get the position once when the page is called. 
	navigator.geolocation.getCurrentPosition(
		geo_success_initial,
		geo_error,
		{enableHighAccuracy:true}
	);
	
};

updatePadSettings = function(pad_uuid) {
	formdata = {
		'user_id': localStorage.geopad_userid,
		'pad_id' : pad_uuid,
		'radius' : $("input:radio[name=pad-radius]:checked").val(),
		'expiry' : $("input:radio[name=pad-expiry]:checked").val(),
		'name' : $("#pad-title").text()
	};
	console.log("sending pad settings to server");
	console.log(formdata);
	$.ajax({
		data: formdata,
		type: "GET",
		contentType: "application/json",
		url: "/api/pad/settings"
	});
};


padsort_recent_activity = function() {
};

padsort_popularity = function() {
};

padsort_created = function() {
};

