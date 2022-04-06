import express from 'express';
import pg from 'pg';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import { format } from 'date-fns';
import jsSHA from 'jssha';
import getHash from './functions.js';

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

// the SALT is a constant value.
// In practice we would not want to store this "secret value" in plain text in our code.
// We will learn methods later in Coding Bootcamp to obfuscate this value in our code.
const SALT = 'i love coding';

let sqlQuery = '';
let loggedIn;

// middleware function to check login authentication before proceeding
app.use((request, response, next) => {
  console.log('Every Request:', request.path);
  // extract loggedInHash and userId from request cookies
  const { loggedInHash, userId } = request.cookies;
  console.log(loggedInHash);
  // create new SHA object
  // reconstruct the hashed cookie string
  const unhashedCookieString = `${userId}-${SALT}`;
  const hashedCookieString = getHash(unhashedCookieString);
  // verify if the generated hashed cookie string matches the request cookie value.
  // if hashed value doesn't match, return 403.
  if (hashedCookieString === loggedInHash) {
    loggedIn = true;
  } else {
    loggedIn = false;
  }
  next();
});

// GET homepage
app.get('/', (request, response) => {
  if (loggedIn) {
    response.render('dashboard');
  } else {
    response.render('homepage');
  }
});

// GET sign up page
app.get('/signup', (request, response) => {
  if (loggedIn) {
    response.render('dashboard');
  } else {
    console.log('request to sign up as new user');
    response.render('signup');
  }
});

// POST to create new user
app.post('/signup', (request, response) => {
  console.log('accept POST request to sign up new user');
  sqlQuery = 'INSERT INTO users (username, password) VALUES ($1, $2)';
  const hashedPassword = getHash(request.body.password);
  const inputData = [request.body.username, hashedPassword];

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
  if (loggedIn) {
    response.render('dashboard');
  } else {
    console.log('request to login');
    response.render('login');
  }
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
    console.log('user details');
    console.log(user);
    const hashedUserInput = getHash(request.body.password);

    if (user.password === hashedUserInput) {
      // create an unhashed cookie string based on user ID and salt
      const unhashedCookieString = `${user.id}-${SALT}`;
      const hashedCookieString = getHash(unhashedCookieString);
      // set the loggedInHash and userId cookies in the response
      response.cookie('loggedInHash', hashedCookieString);
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
  const cookiesInfo = [];
  cookiesInfo.push(request.cookies.username);
  console.log('cookies info');
  console.log(cookiesInfo);
  response.render('dashboard', { cookiesInfo });
});

// DELETE function to log user out
app.delete('/logout', (request, response) => {
  console.log('request to log out');
  response.clearCookie('userId');
  response.clearCookie('loggedInHash');
  response.clearCookie('username');
  loggedIn = false;
  response.redirect('/');
});

app.get('/entry', (request, response) => {
  console.log('request to create new entry');
  response.render('createentry');
});

app.post('/entry', (request, response) => {
  console.log('accept post request to create new entry');
  console.log(request.body);
  const { title, content } = request.body;
  const { username, userId } = request.cookies;
  const inputData = [userId, title, content];

  pool.query('INSERT INTO entries (user_id, title, content) VALUES ($1, $2, $3) RETURNING id', inputData, (error, result) => {
    if (error) {
      console.log('Error creating entry', error.stack);
      response.status(503).render('error');
      return;
    }
    console.log(`created entry for ${username}`);
    const data = result.rows[0];
    console.log({ data });
    response.render('entrycreated', { data });
  });
});

app.get('/entry/:id', (request, response) => {
  console.log('request to view note id:');
  console.log(request.params.id);
  const id = [request.params.id];
  sqlQuery = 'SELECT users.id AS user_id, users.username, entries.id AS entry_id, entries.title, entries.content, entries.created_at FROM users JOIN entries ON users.id = entries.user_id WHERE entries.id = $1';

  pool.query(sqlQuery, id, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error');
      return;
    }

    if (result.rows.length <= 0) {
      console.log('No such id!');
    } else {
      console.log(result.rows);
    }
    const data = result.rows[0];
    const newDate = format(new Date(data.created_at), 'dd MMM yyyy');
    data.created_at = newDate;
    response.render('viewentry', { data });
  });
});

// GET function to render page to edit entry by id
app.get('/entry/:id/edit', (request, response) => {
  console.log('request to edit note id:');
  console.log(request.params.id);
  const id = [request.params.id];
  sqlQuery = 'SELECT * FROM entries WHERE id = $1';

  pool.query(sqlQuery, id, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error');
      return;
    }
    if (result.rows.length <= 0) {
      console.log('No such id!');
    } else {
      console.log(result.rows);
    }
    const data = result.rows[0];
    response.render('editentry', { data });
  });
});

// PUT function to edit note by id
app.put('/entry/:id', (request, response) => {
  console.log('request to edit entry id:');
  console.log(request.params.id);
  const { title, content } = request.body;
  const inputData = [request.params.id, title, content];

  sqlQuery = 'UPDATE entries SET title = $2, content = $3 WHERE id = $1';

  pool.query(sqlQuery, inputData, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error');
      return;
    }
    console.log('entry edited!');
    console.log({ inputData });
    response.render('entryedited', { inputData });
  });
});

// DELETE function to delete entry by id
app.delete('/entry/:id', (request, response) => {
  console.log('request to delete entry id:');
  console.log(request.params.id);
  const id = [request.params.id];
  sqlQuery = 'DELETE FROM entries WHERE id = $1';

  pool.query(sqlQuery, id, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error');
      return;
    }
    console.log('entry successfully deleted');
    response.render('entrydeleted');
  });
});

// GET function to view blog by username
app.get('/blog/:username', (request, response) => {
  console.log('request to view blog of username:');
  console.log(request.params.username);
  const username = [request.params.username];
  sqlQuery = 'SELECT users.id AS user_id, users.username, entries.id AS entry_id, entries.title, entries.content, entries.created_at FROM users JOIN entries ON users.id = entries.user_id WHERE users.username = $1';

  pool.query(sqlQuery, username, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error');
      return;
    }
    if (result.rows.length <= 0) {
      console.log('No results!');
    } else {
      console.log(result.rows);
    }
    const data = result.rows;
    for (let i = 0; i < data.length; i += 1) {
      const newDate = format(new Date(data[i].created_at), 'dd MMM yyyy');
      data[i].created_at = newDate;
    }
    const cookiesInfo = [];
    cookiesInfo.push(request.cookies.username);
    console.log('cookies info');
    console.log(cookiesInfo);
    response.render('viewblog', { data, cookiesInfo });
  });
});

app.set('view engine', 'ejs');

app.listen(80);
