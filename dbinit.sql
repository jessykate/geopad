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
  password VARCHAR(64),
  PRIMARY KEY (uuid)
);

CREATE INDEX pad_area_gindex ON pad_meta USING GIST (area);
