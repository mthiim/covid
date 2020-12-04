import flask
from flask import request, jsonify
from flask_cors import CORS
import rpy2.robjects as robjects
from functools import reduce

robjects.r('library(R0)')
robjects.r('mGT <- generation.time("gamma", c(5.2,2.8))')

def makeRVector(data, doQuote):
     if doQuote:
        data = map(lambda x: '"%s"' % (x), data)
     commasep = reduce(lambda x,y: '%s,%s' % (x,y), data)
     return "c(%s)" % commasep

app = flask.Flask(__name__)
CORS(app)

cache = dict()

@app.route('/rt', methods=['POST'])
def rt():
   print("Received request");
   if True:
      #print(request.args['data'];
      data = request.json
      
      key = str(data['data'] + data['dates']);
      if(key in cache):
         print("Using cached response!")
         return cache[key]

      print(data)

      # Load the data
      toeval = "d <- %s" % (makeRVector(data['data'], False))
      print(toeval)
      robjects.r(toeval)

      # Set the labels
      toeval = "names(d) <- %s" % (makeRVector(data['dates'], True))
      print(toeval)
      robjects.r(toeval)

      # Execute the algorithm
      print("Size %d" % (len(data['data'])))
      toeval = "TD <- est.R0.TD(d, mGT, begin=10, end=%d, nsim=1000)" % (len(data['data'])-1)
      res = robjects.r(toeval);

      n = len(res[0])
      v = []
      vmin = []
      vmax = []
      for i in range(0,9):
         v.append(None)
         vmin.append(None)
         vmax.append(None)
      for i in range(0,n):
         v.append(res[0][i])
         vmin.append(res[1][0][i])
         vmax.append(res[1][1][i])
      v.append(None)
      vmin.append(None)
      vmax.append(None)

      res = { "v": v, "vmin": vmin, "vmax": vmax }
      print(res)
      jsonres = jsonify(res)
      cache[key] = jsonres;
      return jsonres;
   return ""

app.run(threaded=False)
