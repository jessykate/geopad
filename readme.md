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

* Modern versions of OS X come with an older version of postgresql pre-installed. You should [remove the system postgres](http://frankieinguanez.wordpress.com/2012/02/11/complete-un-installation-of-postgresql-from-mac-os-x-lion/) and then install a newer version. 
* once you've cleared the old version (different versions don't coexist well
  together), install the via brew: `brew install postgresql`
* follow the brew instructions to create the first database with `initdb /usr/local/var/postgres -E utf8` 
* if the above command fails, probably need to increase shared memory:
	* `sudo sysctl -w kern.sysv.shmall=65536`
	* `sudo sysctl -w kern.sysv.shmmax=16777216`
	* then rerun `initdb /usr/local/var/postgres -E utf8`
* `brew install postgis`

On linux, install postgresql and postgis if not already present. As of July
2013 on Ubuntu 12.04, installation using the default apt-get packages postgresql and
postgis did NOT work for me. Try using the new [UbunutGIS
PPA](http://trac.osgeo.org/postgis/wiki/UsersWikiPostGIS20Ubuntu1204) from the
postgis folks, as follows:

- `sudo apt-get install python-software-properties`
- `sudo apt-add-repository ppa:ubuntugis/ppa`
- `sudo apt-get update`
- `sudo apt-get install postgresql-9.1-postgis`

modify the file `sudo vi /etc/postgresql/9.1/main/pg_hba.conf`. Change the line
for unix domain sockets to authentication type md5:

	# "local" is for Unix domain socket connections only
	local   all     all                         md5


Set up the geopad database. `cd` into the top level repository directory.
Execute the following commands from the shell (note you may need to become the
postgres user before doing this):

- `sudo su postgres` (if appropriate. sometimes this user is also called psql.
  check /etc/passwd file to see a list of system users if not sure). 
- `createdb geopad`
- `psql -d geopad -c "CREATE EXTENSION postgis;"`

now still as the postgres user, log into the postgres command line (`psql`) and create a user with appropriate permissions:

- `CREATE USER geopad WITH PASSWORD 'somepassword';`
- `GRANT ALL PRIVILEGES ON DATABASE geopad to geopad;`
- `ALTER USER geopad WITH login;` (not sure if this is necessary?)

then log out of the psql shell and out of the postgres account. now **as the
geopad user** create the dataabse tables as follows. creating the tables as the
geopad user gives that user the permissions to query and modify those tables. 

- `psql -U geopad -d geopad -f dbinit.sql`


There's a couple extra packages needed for the node-postgres module to work:

- `sudo apt-get install postgresql-server-dev-9.1 libpq-dev`

You need to have `node.js` and `npm` installed. Make sure you have the most current version of [npm](http://stackoverflow.com/questions/6237295/how-can-i-update-nodejs-and-npm-for-the-next-versions) and [node](http://davidwalsh.name/upgrade-nodejs) installed! 

# Install dependencies

- from the top level repo directory run `npm install` to install all the node
  dependencies listen in package.json

# To Run

Start the server

- run `node app.js` to start the server
- optionally you can install [nodemon](https://npmjs.org/package/nodemon),
  which automatically restarts node for you when any files change (useful for
  development). with nodemon run the app with `nodemon app.js` instead. 

visit `localhost:3000` in your browser
