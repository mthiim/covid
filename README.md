# Danish Covid-19 monitor

This page and accompanying JavaScript etc. shows time series data of COVID-19 infections in the different Danish regions (note: "Copenhagen and Frederiksberg" has been added as a separate region). The data has been smoothed using 7-day moving averages.

You can view the monitor live here [https://www.thiim.net/covid](https://www.thiim.net/covid).

## Building and dependencies

The code depends on [Chart.js](https://www.chartjs.org/) and [JSZip](https://stuk.github.io/jszip/) which it gets
from a CDN.

You can serve it from basically any web server, since it's just static files (however, see below).

### Extra dependencies for R0 calculation
Rt calculations have been experimentally added. To run this you need to also run a backend/backend.py which provides a simple API for calculating the number using R.
You need to have installed Python3, the flask framework, R itself and the R0 package itself beforehand.

