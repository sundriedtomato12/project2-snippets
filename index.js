import express from 'express';
import pg from 'pg';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import { format } from 'date-fns';
import jsSHA from 'jssha';

// Initialise DB connection
const { Pool } = pg;
const pgConnectionConfigs = {
  user: 'postgres',
  host: 'localhost',
  database: 'snippets',
  port: 5432, // Postgres server always runs on this port by default
};
const pool = new Pool(pgConnectionConfigs);

const app = express();
// Configure Express to parse request body data into request.body
app.use(express.urlencoded({ extended: false }));
app.use('/', express.static('public'));
app.use(cookieParser());
// Override POST requests with query param ?_method=PUT to be PUT requests
// This registers ?_method=PUT to be PUT requests
app.use(methodOverride('_method'));

const sqlQuery = '';

app.get('/', (request, response) => {
  response.render('homepage');
});

app.set('view engine', 'ejs');

app.listen(80);
