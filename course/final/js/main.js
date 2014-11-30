(function() {
	var startColor = "#3399ff", 
		highlightColor = "#cc0000",
		minRadius = currentRadius = 1,
		maxSampleSize = 5000,
		mapPath = "data/cities.json",
		bubbleChange = {
			hasChanged: false,
			interval: null, // object
			isSet: false,
			transitionTime: 4000 // milliseconds between changing bubble colors
		},
		cityInput = new CityInput(),
		cache = {
			data: [],
			beginsWith: ""
		},
		loggingEnabled = true;

	var map = new Datamap({
		element: document.getElementById("usmap"),
			scope: "usa",
			geographyConfig: {
			popupOnHover: false,
			highlightOnHover: false
		},
		bubblesConfig: {
			animationComplete: onAnimationComplete,
			bubbleDraw: onBubbleDraw,
			borderColor: startColor,
			borderWidth: 1,
			fillColor: startColor,
			fillOpacity: 0.5,	
			highlightFillColor: highlightColor,
			highlightBorderColor: highlightColor,			
			highlightFillOpacity: 0.5,
			highlightOnHover: true,
			popupOnHover: true
		},
		done: onDataMapLoad		 
	});
	
	// load data and initialize Map
	d3.json(mapPath, setupMap);

/*** Functions ***/
	
	/* updates the data to only show cities beginning with "beginsWith" */
	function filterCities(data, beginsWith) {
		var timer = new Timer();
		
		if(beginsWith && beginsWith.length > 0) {
			// check to see if we can re-use cached data
			if(cache.data.length > 0 && 
					beginsWith.indexOf(cache.beginsWith) == 0 && 
					cache.data.length < maxSampleSize) data = cache.data;
		
			// store search text
			cache.beginsWith = beginsWith.toLowerCase();
			
			// we have a city search string
			cache.data = sampleData(
				_.filter(data, function(row) {
					var city = row.city.toLowerCase();
					return (city.indexOf(cache.beginsWith) == 0);
				})
			);
		} else {
			// empty city search, sample from all data
			cache.beginsWith = "";
			cache.data = sampleData(data);
		}

		// refresh bubbles on map	
		updateDataMap(cache.data);
		
		// show table on right side
		var tableData = (cache.data.length < maxSampleSize) ? cache.data : data;
		tableData = _.filter(data, function(row) {
			var city = row.city.toLowerCase();
			return (city.indexOf(cache.beginsWith) == 0);
		});
		showBeginsWithTable(tableData);
		
		// update text stats at bottom of map		
		updateStats(cache.data, timer);	
	}
	
	/* formats json data to DataMaps format */
	function formatToDataMaps(data) {
		data = _.map(data, function(row) {
			return {
				latitude: row.la,
				longitude: row.lo,
				city: row.ci,
				state: row.st,
				radius: currentRadius
			}
		});
		return data;
	}

	/* resets bubble border/fill colors to match */
	function resetBubbleColors() {
      var options = map.options.bubblesConfig;
		d3.selectAll("circle.datamaps-bubble:not(.highlight)")
			.transition()
			.duration(500)
			.style("fill", options.borderColor)
			.style("stroke", options.fillColor);
			
		toConsole("reset bubble color: " + options.fillColor + "," + options.borderColor);
		
		bubbleChange.hasChanged = false;	
	}

	/* restarts interval timer to change the color of bubbles on the map */
	function restartBubbleColorTimer() {
		if(bubbleChange.hasChanged) resetBubbleColors();
	
		if(bubbleChange.isSet) return;

		setTimeout(function() {
			// this prevents clearing the timer excessively (for every move of the mouse)
			// it causes an interval reset to occur (at maximum) once every 500ms
			bubbleChange.isSet = false;
		}, 500);

		// clear interval if it was already set
		if(bubbleChange.interval) {
			clearInterval(bubbleChange.interval);
			bubbleChange.interval = null;
			bubbleChange.isSet = false;
		}
		
		// restart interval
		bubbleChange.isSet = true;
		
		// changes bubble colors after interval has elapsed
		bubbleChange.interval = setInterval(function() {
			var fillColor = randomColor(),
				borderColor = randomColor("border");
			
			toConsole("change bubble color: " + fillColor + "," + borderColor);

			d3.selectAll("circle.datamaps-bubble:not(.highlight)")
				.transition()
				.duration(1500)
				.style("fill", fillColor)
				.style("stroke", borderColor);
			
			// bubble colors have been changed due to non-activity
			bubbleChange.hasChanged = true;
			
			// change popup hover
			var $this = d3.select("circle"),
				datum = JSON.parse($this.attr("data-info")),
				options = map.options.bubblesOptions,
				svg = map.svg;
				
			// todo: show random popup
			//map.updatePopup($this, datum, options, svg);
			
			function randomColor(type) {
				var random = Math.floor((Math.random()*50)+1),
					start, end;
					
				if(type == "border") {
					start = startColor;
					end = "#cc00cc";
				} else {
					start = "#ff5c00";
					end = "#ffd300";
				}
					scale = d3.scale.linear().domain([1,50]).range([start, end]);
				return scale(random);		
			}			
		}, bubbleChange.transitionTime);	
	}

	/* reduces dataset size, so as not to overwhelm the map with too many data points */
	function sampleData(data) {
		// todo: try to add population
		return _.sample(data, maxSampleSize);
	}

	/* sets up the initial map after a dataset has been loaded from JSON or CSV */
	function setupMap(data) {
		// format the data for the topojson format
		var allCities = formatToDataMaps(data),
			refreshingMap = false;
	 
	 	// update bubbles on map
		filterCities(allCities, cityInput.getValue());

		// event handler for when city name is changed
		cityInput.onChange(function(input) {
			// restart color changer
			restartBubbleColorTimer();
			
			// prevents the map from being repeatedly refreshed when 
			// multiple input events are fired in a short period
			if(!refreshingMap) {
				refreshingMap = true;
				setTimeout(function() {
					filterCities(allCities, input.value);
					refreshingMap = false;
				}, 1000);
			}
		});
	}
	
 	/* logs text to console if logging is enabled */
	function toConsole(text) {
		if(loggingEnabled) console.log(text);
	}	
	
	/* calls the DataMap library to refresh the bubbles on map */
	function updateDataMap(data) {
		var radiusScale = d3.scale.pow().exponent(.2)
			.domain([1, maxSampleSize])
			.rangeRound([10, minRadius]);
		
		currentRadius = radiusScale(data.length);
		
		data = _.map(data, function(row) {
			row.radius = currentRadius;
			return row;
		});
		
		map.bubbles(data, {
			popupTemplate: function (geo) {
				return '<div class="hoverinfo">' + geo.city +
					', ' + geo.state + '</div>';
			}
		});		
	} 

	/* updates the text statistics below the graph */
	function updateStats(data, timer) {
		timer.stop();
		d3.selectAll(".execution_time").text(timer.time);
		d3.selectAll(".record_count").text(data.length);
	}
	
	/* shows table of up to 26 entries with the next beginsWith possibilities */
	function showBeginsWithTable(data) {
		var table = d3.selectAll("#citylist table"),
			currentValue = cityInput.getValue();

		// count records by grouping next beginsWith + next character
		var nodeRollup = d3.nest()
			.key(function(d) {
				return d.city.substring(0, cache.beginsWith.length + 1).toLowerCase(); 
			})
			.rollup(function(leaves) {return leaves.length;})
			.entries(data)
			.map(function(d) {
				return {beginsWith: d.key, count: d.values};			
			})
			.sort(function(a, b) { 
				return d3.descending(a.count, b.count); 
			});

		if(nodeRollup.length == 0) {
			// no cities matched
			nodeRollup = [{
				beginsWith: "(no matched cities)",
				count: 0
			}];
		}
	
		// count all records
		var allRollup = d3.nest()
			.rollup(function(leaves) {
				return {
					total: d3.sum(leaves, function(d) {return d.count;})				
				};
			})
			.entries(nodeRollup);
	
		var columns = d3.keys(nodeRollup[0]);

		// databind rows
		var rows = table.selectAll("tr").data(nodeRollup);

		// enter new rows
		rows
			.enter()
			.append("tr")
			.on("mouseover", function(datum) {
				var className = datum.beginsWith.toLowerCase().replace(" ", "-space-");
				d3.selectAll("circle." + className)
					.classed("highlight", true);
			})
			.on("mouseout", function(datum) {
				var className = datum.beginsWith.toLowerCase().replace(" ", "-space-");
				d3.selectAll("circle." + className)
					.classed("highlight", false);			
			})
			.style("opacity", 0.0)			
			.transition()
			.duration(1000)
			.style("opacity", 1.0);
		
		// databind cells
		var cells = rows.selectAll("td")
			.data(function(d) {
				return columns.map(function (column) {
					return { key: column, value: d[column] };
				});
			});
		
		// enter new cells
		cells
			.enter()
			.append("td")
			.attr("class", function(d) {
				return d.key;
			});
	
		// enter + update text
		cells.html(function (d, i) {
				var value = d.value,
					text = "",
					lastChar;

				if(i == 0) {
					// first column - text
					if(currentValue == value) {
						// exact match
						text += "\"" + value + "\"";
					}
					else if (allRollup.total > 0) {
						// partial match
						text = value.substring(0, value.length - 1);
						lastChar = value.substring(value.length - 1);
						if(lastChar == " ") lastChar = "[space]";
						text += "<span class='nextChar'>" + lastChar + "</span>";
					}
					else {
						// no matches
						text += value;
					}		
				}
				else if (i == 1) {
					// second column - count and percentage
					if(allRollup.total > 0)
						text += value + " <span class='percentage'>(" + (Math.round(value * 10000.0 / allRollup.total) / 100) + "%)</span>";
				}
				
				return text;
			})
		
		// remove invalid cells
		cells
			.exit()
			.remove();
		
		// remove invalid rows
		rows
			.exit()
			.remove();
	}
	
/* Events */
	function onAnimationComplete(datamap, bubbles) {
		bubbles
			.transition()
			.duration(100)
			.attr("r", function ( datum ) {
				return datum.radius;
			});
	}
	
	function onBubbleDraw() {
		var currentValue = cityInput.getValue(),
			city = this.data()[0].city,
			className = city.substring(0, currentValue.length + 1).toLowerCase(),
			classes = this.attr("data-baseClass");
		
		// convert spaces to text
		className = className.replace(" ", "-space-");
		
		// save original classes
		if(!classes) {
			classes = this.attr("class");
			this.attr("data-baseClass", classes)
		};
		
		classes += " " + className;
		
		// add beginsWith + 1 character as class name
		this.attr("class", classes);
	}

	function onDataMapLoad(datamap) {
		datamap.svg.selectAll(".datamaps-subunit").on("click", function(geo) {
			toConsole(geo.properties.name);
		});
		
		d3.select("body").on("mousemove", function() {
			// this causes the timer that changes bubble colors to be reset 
			// keeps bubbles the same color when the mouse is moving
			restartBubbleColorTimer();
		});
		
		// start the timer
		restartBubbleColorTimer();
	}			

/* CityInput Class */
	function CityInput() {
		var inputField = d3.select("#city"),
			onChangeCallback;
		
		// public methods
		this.getValue = function() {
			var val = inputField.property("value");
			return (val) ? val : "";
		};
	
		this.onChange = function(callback) {
			onChangeCallback = callback;
		}

		this.setValue = function(value){
			inputField.attr("value", value);
		};
	
		// private methods
		function getValueFromSession() {
			if(typeof(Storage) !== "undefined") {
				// code if HTML5 sessionStorage is supported by browser
				if(sessionStorage.CityValue) {
					return sessionStorage.CityValue;
				}
			}	
			return "";
		}
		function setValueToSession(value) {
			if(typeof(Storage) !== "undefined") {
				// code if HTML5 sessionStorage is supported by browser
				sessionStorage.CityValue = (!value) ? "" : value;
			}		
		}
	
		// initialize
		this.setValue(getValueFromSession());
	
		// event handler for when input field changes
		inputField.on("input", function() {
			setValueToSession(this.value);
			(typeof onChangeCallback === "function") && onChangeCallback(this);
		});
	}

/* Timer Class */
	function Timer() {
		var start, end;
		this.reset = function() {
			start = end = new Date().getTime();
			return this;
		}
		this.start = function() {
			start = new Date().getTime();
			return this;
		}
		this.stop = function() {
			end = new Date().getTime();
			this.time = end - start;
			return this;
		}
		this.time = 0;
		this.reset();		
	}
	
})();