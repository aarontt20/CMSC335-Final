const http = require("http");
const path = require("path");
const express = require("express");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const bodyParser = require('body-parser');
const date = require('date-and-time');
const { info } = require("console");
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config({path: path.resolve(__dirname, '.env')});


const DB_NAME = process.env.MONGO_DB_NAME;
const COLLECTION = process.env.MONGO_COLLECTION;
const uri = `mongodb+srv://${process.env.MONGO_DB_USERNAME}:${process.env.MONGO_DB_PASSWORD}@cluster0.altu1ms.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1});

const portNumber = process.env.PORT ?? 300;
const app = express();

app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");

app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: false }));

app.get("/", (request, response) => {
   response.render("index");
});

app.get("/observation", async (request, response) => {
    let body = request.query.object ?? '-1'
    let lat = request.query.lat ?? '38.9897';
    let lon = request.query.lon ?? '-76.9378';
    let start = !request.query.start ? date.format(new Date(), "YYYY-MM-DDTHH:mm") : date.format(new Date(request.query.start), "YYYY-MM-DDTHH:mm");
    let end = !request.query.end ? '' : date.format(new Date(request.query.end), "YYYY-MM-DDTHH:mm");
    let step = request.query.step ?? 1;
    let data = '<div class="hint">Search for a celestial body!</div>';

    if(body !== '-1' && request.query.end) {
        let raw = await horizonAPI(body, lat, lon, request.query.start ? new Date(request.query.start) : new Date(), request.query.end? new Date(request.query.end) : new Date(), step);
        data = formatObservation(raw);
    }

    const variables = {
        body: body,
        lat: lat,
        lon: lon,
        start: start,
        end: end,
        step: step,
        data: data
    }

    response.render("observation", variables);
});

app.post("/subscribe", async (request, response) => {
    let email = request.body.email;

    let user = {
        type: 'user',
        email: email
    }

    try {
        await client.connect();
        await client.db(DB_NAME).collection(COLLECTION).insertOne(user);
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }

    const variables = {
        email: email
    }

    response.render("subscribe", variables);
});

app.get("/meetup", (request, response) => {
    const variables = {
        info: ''
    }

    response.render("meetups", variables);
});

app.post("/meetup", (request, response) => {
    let info = `Email: ${request.body.email} not found.<br>You must be subscribed to our mailing list to make a proposal!`;

    const variables = {
        info: info
    }

    response.render("meetups", variables);
});

app.post("/meetup/submit", async (request, response) => {
    const filter = {type: 'user', email: request.body.email};
    let user = {type: 'user', email: 'NONE'};

    try {
        await client.connect();
        let res = await client.db(DB_NAME).collection(COLLECTION).findOne(filter);
        if (res) {
            user = res;
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }

    if(user.email === 'NONE') {
        response.redirect(307, '/meetup');
    } else {
        let meet = {
            type:'meet',
            first_name: request.body.first,
            last_name: request.body.last,
            email: request.body.email,
            purpose: request.body.purpose,
            date: request.body.date,
            location: request.body.location,
            equipment: request.body.equipment,
            notes: request.body.notes
        }

        try {
            await client.connect();
            await client.db(DB_NAME).collection(COLLECTION).insertOne(meet);
        } catch (e) {
            console.error(e);
        } finally {
            await client.close();
        }

        response.render("submit_meet");
    }
});


async function horizonAPI(body_id, lat, lon, start, end, step) {
    let object = `'${body_id}'`
    let location = `'${lat},${lon},0'`;
    let start_time = date.format(start, "'YYYY-MMM-D HH:mm:00'");
    let end_time = date.format(end, "'YYYY-MMM-D HH:mm:00'");
    let step_time = `'${step}min'`;
    let url = `https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND=${object}&OBJ_DATA=no&SITE_COORD=${location}&START_TIME=${start_time}&STOP_TIME=${end_time}&STEP_SIZE=${step_time}&CENTER=coord&CSV_FORMAT=yes`;
    let res = await fetch(url);
    let text = await res.text();
    let r = text.substring(text.indexOf("$$SOE") + 5, text.indexOf("$$EOE") - 1).trim().split('\n');
    r = r.map(e => {
        let i = e.split(',');
        return [i[0].trim(), i[3].trim(), i[4].trim(), i[7].trim(), i[8].trim(), i[9].trim(), i[10].trim(), i[11].trim(), i[12].trim()];
    });
    return r;
}

function formatObservation(data) {
    let f = '<table id="data"><tr><th class="dt">Date Time</th><th class="ra">Right Ascension</th><th class="dc">Declination</th><th class="az">Azimuth</th><th class="el">Elevation</th></tr>';
    for(let e of data) {
        f += `<tr><td class="dt">${e[0]}</td><td class="ra">${e[1]}</td><td class="dc">${e[2]}</td><td class="az">${e[5]}</td><td class="el">${e[6]}</td></tr>`;
    }

    return f;
}

app.listen(portNumber);

process.stdout.write(`Web server started and running at http://localhost:${portNumber}\n`);
const prompt = 'Stop to shutdown the server: ';

process.stdout.write(prompt);
process.stdin.setEncoding('utf8');
process.stdin.on('readable', () => {
    let input = process.stdin.read();

    if(input !== null) {
        let command = input.trim();

        if(command === 'stop') {
            process.stdout.write('Shutting down the server\n');
            process.exit(0);
        }
        else {
            process.stdout.write(`Invalid Command: ${command}\n`);
        }

        process.stdout.write(prompt);
        process.stdin.resume();
    }
})