/* MIT License

Copyright (c) 2020 Martin Thiim (martin@thiim.net)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
"use strict";

/* Constants */
const chart_width = "80vw";
const chart_height = "40vw";
const chart_colors = ['#4dc9f6',
    '#f67019',
    '#f53794',
    '#537bc4',
    '#acc236',
    '#166a8f',
    '#00a950',
    '#58595b',
    '#8549ba'
];
const regex_for_getting_ssi_link = /a href="(https:\/\/files.ssi.dk\/covid19\/overvagning\/[^"]+)"/;

/* Globals */
let regions = null;
let csvtimestamp = null;
let dates = null;
let url = null;

/* Utility function: Given a text, this function creates a generator that emits individual lines */
function* line_generator_from_text(text) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        yield lines[i];
    }
}

/* Round to one decimal place */
function round(x) {
    return Math.round(x * 10) / 10;
}

/* Just a sum function */
function sum(a, b) {
    return a + b;
}

async function getCSVFromSSI() {
    // In the below we retrieve and process the SSI data, as well as our own file with region/muni link data in parallel
    // Here we build promise to get the SSI data. The link changes when a new file is published so we need to get fresh link using regex
    let ssi_main_page = await fetch("https://covid19.ssi.dk/overvagningsdata/download-fil-med-overvaagningdata");
    let ssi_main_text = await ssi_main_page.text();

    // Use regex to find the link
    const res = regex_for_getting_ssi_link.exec(ssi_main_text);
    if (!res) {
        throw "Couldn't find download link";
    }
    url = res[1];

    let data_file = await fetch(url);
    let zip_file = await JSZip.loadAsync(await data_file.arrayBuffer());
    let csv_file = await zip_file.file("Municipality_cases_time_series.csv");
    csvtimestamp = csv_file.date;
    return csv_file.async("string");
}

async function getRegionsMunis() {
    let regions_munis = await fetch("regions_munis.json");
    let regions = await regions_munis.json();

    // Build a list of all munis
    const munis = {};
    regions.forEach(region => {
        region.munis.forEach(muni => {
            munis[muni.name] = muni;
        });
    });

    // Unify references to munis
    regions.forEach(region => {
        region.munis = region.munis.map(muni => munis[muni.name]);
    });

    return {
        regions: regions,
        munis: munis
    };
}

/* Loads the data */
async function load() {
    // Do the two fetches (SSI data, and regions_munis daa) in parallel

    // Get the CSV from SSI 
    const loading_csv_promise = getCSVFromSSI();

    // Promise for fetching the regions/muni data
    const regions_munis_promise = getRegionsMunis();

    // Await all the data to become available   
    let csvcontent, regions_munis;
    [csvcontent, regions_munis] = await Promise.all([loading_csv_promise, regions_munis_promise]);

    regions = regions_munis.regions;
    const munis = regions_munis.munis;

    // Start processing CSV
    const line_generator = line_generator_from_text(csvcontent);

    // Get muni headings from CSV (slice the first one away since this is the 'Date' column header)
    const muni_headings_from_csv = line_generator.next().value.split(';').slice(1);

    // Skip the initial part from the file (we wanna start at 1/8)
    for (let i = 0; i < 150; i++) {
        line_generator.next();
    }

    // Start reading the file line-by-line (i.e. date-by-date)
    dates = [];
    for (let line of line_generator) {
        line = line.trim();
        if (line == "") continue;

        // Format is: <date>;<muni1-number>;<muni2-number>, ...
        const tokens = line.split(";");
        let date = tokens[0];

        // Process the muni numbers (slice to get rid of date)
        tokens.slice(1).forEach((tok, i) => {
            const c = parseInt(tok);

            // Get muni name from heading
            const muniname = muni_headings_from_csv[i];

            // Get muni structure and add data
            const muni = munis[muniname];
            if (muni == null) return;
            if (!muni.data) {
                muni.data = [];
            }
            muni.data.push(c);
        });
        dates.push(date);
    }


    // Sum up data for each region, for each date
    regions.forEach(region => {
        // Logic is: For each date we calculate the data by first mapping each muni object to the count for the date we are looking at,
        // and then summing (through reduce) over that.
        region.data = dates.map((date, i) => region.munis.map(a => a.data[i]).reduce(sum, 0));
    });

    // Trigger update of display
    await update();
}

function reportError(e) {
    const csvfile_el = document.getElementById("csvfile");
    csvfile_el.innerHTML += '<p><b><font color="red">' + e + '</font></b>';
}

async function init() {
    document.getElementById("days").addEventListener("change", update);
    try {
        await load();
    } catch (e) {
        reportError("Error initializing: " + e);
        throw e;
    }
}

async function calculateRt(labels, region) {
    let data = {
        dates: labels,
        data: region.avgdata
    };
    let response = await fetch("/rt", {
        method: 'POST', // *GET, POST, PUT, DELETE, etc.
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data) // body data type must match "Content-Type" header
    });

    let res = response.json();
    return res;
}

/* Refreshes the graphs (data must have been loaded, by load() ) */
async function update() {
    // Clear the charts if already there
    const section = document.getElementById("charts");
    section.innerHTML = "";

    // Write out file info
    const csvfile_el = document.getElementById("csvfile");
    csvfile_el.innerHTML = "The latest file from SSI is: <a href='" + url + "'>" + url + "</a>";

    // Get number of days to ignore
    const ignd = document.getElementById("days");
    const ign_value = ignd.value;
    let ignore_days = 2;
    try {
        const days = parseInt(ign_value);
        if (days < 0 || days > 10) {
            throw "Days out of bounds: " + days;
        }
        ignore_days = days;
    } catch (e) {
        reportError("Invalid number of ignore-days specified, using 2 as fallback: " + e);
        console.log("Error: " + e);
    }

    const lastdate = dates[dates.length - 1];
    const secondlastdate = dates[dates.length - 1 - ignore_days];

    const dateinfo = document.getElementById("dateinfo");
    dateinfo.innerHTML = "Latest data in the file is for date <b>" + lastdate + "</b>, however we are only using data up to <b>" + secondlastdate + "</b>. The timestamp inside the zip-file is: <b>" + csvtimestamp.toLocaleString("da-DK") + "</b>.";


    // Create array of labels - since we date each average point by the last date we must chop off the first 6
    let labels = dates.slice(6);

    // If using ignore days, chop off those at the end
    if (ignore_days > 0) {
        labels = labels.slice(0, -ignore_days);
    }

    // Calculate data for each region and label
    regions.forEach(region => {
        // Calculate the moving averages and store with region data
        region.avgdata = labels.map((x, i) => region.data.slice(i, i + 7).reduce(sum, 0) / 7);

        // Transform to weekly averages weighted region size
        region.avgdataweighted = region.avgdata.map(x => 7 * x / (region.pop / 100000));

        // Round both data sets
        region.avgdata = region.avgdata.map(round);
        region.avgdataweighted = region.avgdataweighted.map(round);

        region.rt = calculateRt(labels, region).then(rtdata => rtdata.v);
    });

    labels.push(""); // Dummy label at the end - makes graph looks nicer


    // Now insert the charts!
    // First chart: The one with all regions
    const wdatasets = [];
    regions.forEach((region, i) => {
        let el = {
            label: region.name,
            data: region.avgdataweighted,
            fill: false,
            backgroundColor: chart_colors[i],
            borderColor: chart_colors[i],
            yAxisID: 'y1'
        };
        wdatasets.push(el);
    });

    const data = {
        datasets: wdatasets,
        labels: labels
    };

    insertChart("Summary all regions (infected per week per 100000 persons, 7-day moving average)", data, "Infected per week per 100,000 persons (7-day moving average)");

    /*
        // Second set of charts: Individual regions with weighting
        regions.forEach((region, i) => {
            const data = {
                datasets: [{
                    label: 'Infected',
                    data: region.avgdataweighted,
                    fill: false,
                    backgroundColor: chart_colors[i],
                    borderColor: chart_colors[i],
                    yAxisID: 'y1'
                }],
                labels: labels
            };
            insertChart(region.name + " (infected per week per 100000 persons as 7-day moving average)", data, "Infected per week per 100,000 persons (7-day moving average)");
        });
    */

    // Third set of charts: Individual regions without weighting
    let i = 0;
    // Note would have been tempting to use forEach with index, but it doesn't work so well since we need to await for the Rt calculation
    // and we want the graphs in order, so instead we use for..of but it doesn't have index. So we need to track the index manually (via i).
    for (const region of regions) {
        const d = await region.rt;
        const data = {
            datasets: [{
                    label: 'Infected',
                    data: region.avgdata,
                    fill: false,
                    backgroundColor: chart_colors[i],
                    borderColor: chart_colors[i],
                    yAxisID: 'y1'
                },
                {
                    label: 'Rt',
                    data: d,
                    borderWidth: 1,
                    pointRadius: 0,
                    borderDash: [5, 5],
                    fill: false,
                    backgroundColor: '#000000',
                    borderColor: '#000000',
                    yAxisID: 'y2'
                }
            ],
            labels: labels
        };
        insertChart(region.name + " (infected per day as 7-day moving average, and estimated reproduction number)", data, "Infected per day (7-day moving average)", "Estimated reproduction number");
        i++;
    }
}

async function insertChart(title, data, yAxesLabel, y2AxesLabel) {
    const section = document.getElementById("charts");

    const header = document.createElement('h2');
    const textnode = document.createTextNode(title);
    header.appendChild(textnode);
    section.appendChild(header);


    const div = document.createElement('div');
    div.class = "chart-container";
    div.style.position = "relative";
    div.style.height = chart_height;
    div.style.width = chart_width;

    section.appendChild(div);
    const canvas = document.createElement('canvas');
    div.appendChild(canvas);


    const yaxes = [];

    yaxes.push({
        display: true,
        scaleLabel: {
            display: true,
            labelString: yAxesLabel
        },
        id: 'y1',
        position: 'left'
    });

    if (y2AxesLabel) {
        yaxes.push({
            display: true,
            scaleLabel: {
                display: true,
                labelString: y2AxesLabel
            },
            id: 'y2',
            position: 'right'
        });
    }

    let options = {
        responsive: true,
        scales: {
            yAxes: yaxes
        }
    };


    const ctx = canvas.getContext('2d');
    const myLineChart = new Chart(ctx, {
        type: 'line',
        data: data,
        options: options

    });
}

/* Initialization code */
init();
