-- the geopads database must already exist to run this file. make sure the following commands have been run:
-- CREATE DATABASE geopad; (or from bash shell: createdb geopad)
-- psql -d geopad -c "CREATE EXTENSION postgis;"
-- then to run this file, from the bash shell, do:
-- psql geopad -f dbinit.sql

CREATE TABLE IF NOT EXISTS pad_meta ( 
  uuid CHAR(32),
  created TIMESTAMP,
  updated TIMESTAMP,
  name VARCHAR(128),
  origin GEOMETRY(Point, 26910),
  radius INTEGER,
  area GEOMETRY(Polygon),
  expiry TIMESTAMP,
  salt CHAR(10),
  creator CHAR(32),
  private BOOLEAN DEFAULT FALSE,
  password VARCHAR(64),
  PRIMARY KEY (uuid)
);

CREATE INDEX pad_area_gindex ON pad_meta USING GIST (area);

CREATE TABLE IF NOT EXISTS active (
	id SERIAL PRIMARY KEY, 
	uuid CHAR(32), 
	foreign key (uuid) references pad_meta(uuid)
);

CREATE TABLE IF NOT EXISTS membership (
	padid CHAR(32),
	userid CHAR(32),
	owner BOOLEAN,
	PRIMARY KEY (padid, userid)
);

CREATE INDEX membership_padid_index ON membership (padid);
CREATE INDEX membership_userid_index ON membership (userid);


CREATE TABLE IF NOT EXISTS userprofile (
	userid CHAR(32) PRIMARY KEY,
	name VARCHAR,
	email VARCHAR(256),
	publickey CHAR(2048),
	privatekey CHAR(2048)
);


