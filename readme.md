# About

Create location-specific notepads that are implicitly shared with people
nearby. Pads have a radius and optionally an expiry time. The only catch is you
have to have been there, to gain access to a pad. Easily share pictures, notes
or links with people at a concert, conference or coffee shop; leave notes for
your friends (*"Python meetup - we're in the back!"*), or create lists you can
easily find in the right location (*"Need Sriracha."*). Once you gain access to
a pad, you have the option to save it and access it later. 

Geopad is a Node.js app built with Express and PostGIS on the backend. Jade is
used for templating and socket.io for real time messaging. 

# Setup

removing system postgres
* http://frankieinguanez.wordpress.com/2012/02/11/complete-un-installation-of-postgresql-from-mac-os-x-lion/
* `brew install postgresql`
* follow the brew instructions to create the first database with `initdb /usr/local/var/postgres -E utf8` 
* if the above command fails, probably need to increase shared memory:
  * `sudo sysctl -w kern.sysv.shmall=65536`
  * `sudo sysctl -w kern.sysv.shmmax=16777216`
  * then rerun `initdb /usr/local/var/postgres -E utf8`
* `brew install postgis`


upgrading npm and node: 
* http://stackoverflow.com/questions/6237295/how-can-i-update-nodejs-and-npm-for-the-next-versions
* http://davidwalsh.name/upgrade-nodejs

# To Run

install dependencies

- cd into the top level repository directory
- first time, run `npm install` to install all the node dependencies listen in package.json

start the server

- run `node app.js` to start the server

visit `localhost:3000` in your browser
