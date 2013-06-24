-- the geopads database must already exist to run this file. make sure the following commands have been run:
-- CREATE DATABASE geopads;
-- psql -d geopads -c "CREATE EXTENSION postgis;"
-- then to run this file 

CREATE TABLE IF NOT EXISTS pads_meta ( 
  id SERIAL PRIMARY KEY,
  created TIMESTAMP,
  updated TIMESTAMP,
  name CHAR(128),
  origin GEOMETRY(Point, 26910),
  radius INTEGER,
  area GEOMETRY(Polygon),
  expiry TIMESTAMP,
  salt CHAR(10),
  password CHAR(64)
);

CREATE INDEX pad_area_gindex ON pads_meta USING GIST (area);
