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

let sqlQuery = '';

// GET homepage
app.get('/', (request, response) => {
  response.render('homepage');
});

// GET sign up page
app.get('/signup', (request, response) => {
  console.log('request to sign up as new user');
  response.render('signup');
});

// POST to create new user
app.post('/signup', (request, response) => {
  console.log('accept POST request to sign up new user');
  sqlQuery = 'INSERT INTO users (username, password) VALUES ($1, $2)';

  // initialise the SHA object
  const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
  // input the password from the request to the SHA object
  shaObj.update(request.body.password);
  // get the hashed password as output from the SHA object
  const hashedPassword = shaObj.getHash('HEX');

  const inputData = [request.body.username, hashedPassword];
  console.log(inputData);

  pool.query(sqlQuery, inputData, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error');
      return;
    }

    console.log('Successfully added new user to database');
    response.render('signupsuccessful');
  });
});

app.get('/login', (request, response) => {
  console.log('request to login');
  response.render('login');
});

app.post('/login', (request, response) => {
  console.log('accept POST request to log user in');
  const inputData = [request.body.username];

  sqlQuery = 'SELECT * FROM users WHERE username=$1';

  pool.query(sqlQuery, inputData, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error');
      return;
    }
    if (result.rows.length === 0) {
      // couldn't find user with that username
      // error for password and user are the same
      // don't tell the user which error they got for security reasons
      // otherwise they can guess if a person is a user of a given service
      response.status(403).render('error');
      return;
    }

    const user = result.rows[0];
    console.log(user);

    // initialise the SHA object
    const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
    // input the password from the request to the SHA object
    shaObj.update(request.body.password);
    // get the hashed password as output from the SHA object
    const hashedUserInput = shaObj.getHash('HEX');

    if (user.password === hashedUserInput) {
      response.cookie('loggedIn', true);
      response.cookie('username', user.username);
      response.cookie('userId', user.id);
      console.log('Login successful!');
      response.redirect('/dashboard');
    } else {
      response.status(403).render('error');
    }
  });
});

app.get('/dashboard', (request, response) => {
  response.render('dashboard');
});

app.set('view engine', 'ejs');

app.listen(80);
