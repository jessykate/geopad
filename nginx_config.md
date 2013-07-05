Example Nginx proxy config for sockets

<hr>

	upstream geopad-nodejs {
		server 127.0.0.1:3000;
	}

	map $http_upgrade $connection_upgrade {
			default upgrade;
			''      close;
		}

	server {

		listen 80;
		server_name geopad.io;
		access_log /var/log/nginx/geopad_access.log;
		error_log /var/log/nginx/geopad_error.log;

			location / {
			# header unchanged
			proxy_set_header Host $http_host;

			# i have no idea what these mean :/
			proxy_set_header X-Real-IP $remote_addr;
					proxy_set_header X-Scheme $scheme;

			# by referring to the upstream server using this
					# definition, we can easily add more application
					# servers if we want to later.
			proxy_pass http://geopad-nodejs/;

			# WebSocket support (nginx 1.4)
			proxy_http_version 1.1;
			proxy_set_header Upgrade $http_upgrade;
			proxy_set_header Connection "Upgrade";

			proxy_redirect off;

		}

	}
