# Danish Covid-19 monitor

This page and accompanying JavaScript etc. shows time series data of COVID-19 infections in the different Danish regions (note: "Copenhagen and Frederiksberg" has been added as a separate region). The data has been smoothed using 7-day moving averages.

You can view the monitor live here [https://www.thiim.net/covid](https://www.thiim.net/covid).

All the code is frontend code.

## Building and dependencies

The code depends on [Chart.js](https://www.chartjs.org/) and [JSZip](https://stuk.github.io/jszip/). 

To build using [npm](https://www.npmjs.com/), run 'npm install' which will also download the dependencies. Then run "npx webpack".

