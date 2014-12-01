(function() {
	// changeable
	var 
		borderColorRange = ["#5f9ea0", "#0000ff"],
		fillColorRange = ["#00bfff", "#191970"],
		inactivityTimer = {
			delayTime: 5000, // milliseconds of no mouse activity before timer starts
			bubbleTransitionTime: 3000 // milliseconds between changing bubble colors
		},
		mapPath = "data/cities.csv",
		maxSampleSize = 5000,
		minRadius = 1,
		loggingEnabled = true,
		startColor = "#1e50ff";

	// internal
	var
		cityInput = new CityInput(),
		cache = {
			data: [],
			beginsWith: ""
		},
		map = new Datamap({
			element: document.getElementById("usmap"),
				scope: "usa",
				geographyConfig: {
				popupOnHover: false,
				highlightOnHover: false
			},
			bubblesConfig: {
				animationComplete: onAnimationComplete,
				bubbleDraw: onBubbleDraw,
				bubbleMouseOver: onBubbleMouseOver,
				bubbleRadius: minRadius,
				borderColor: startColor,
				borderWidth: 1,
				fillColor: startColor,
				fillOpacity: 0.5,	
				highlightClassName: "highlight",
				highlightOnHover: true,
				popupOnHover: true
			},
			done: onDataMapLoad		 
		});
	
	// load data and initialize Map
	d3.csv(mapPath, function(data) {setupMap(data, "csv");});

/*** Functions ***/

	function changeBeginsWith(reset) {
		var list = d3.selectAll("#citylist tr"), 
			listSizeChanged = (this.listSize != list.size()),
			highlightItem;
		
		if(reset) {
			// reset (unhighlight)
			list.each(unHighlightBeginsWith);
		}
		else {
			// change highlighted beginsWith entry
			this.listSize = list.size();

			if(this.listIndex === undefined || listSizeChanged || (this.listIndex + 1) >= this.listSize)
				this.listIndex = 0; // initialize or start at the beginning
			else
				this.listIndex = this.listIndex + 1; // go to the next list item
		
			highlightItem = d3.select(list[0][this.listIndex])
				.each(highlightBeginsWith);

			list
				.filter(function(d) {
					return d.beginsWith != highlightItem.data()[0].beginsWith;
				})
				.each(unHighlightBeginsWith);

			toConsole("change beginsWith selection");
		}
	}	
	
	/* changes bubbles to a new set of random colors within certain color scales */
	function changeBubbleColors() {
		var fillColor = randomColor(fillColorRange),
			borderColor = randomColor(borderColorRange);
		
		toConsole("change bubble color: " + fillColor + "," + borderColor);

		d3.selectAll("circle.datamaps-bubble:not(.highlight)")
			.transition()
			.duration(inactivityTimer.bubbleTransitionTime)
			.style("fill", fillColor)
			.style("stroke", borderColor);
		
		// bubble colors have been changed due to non-activity
		inactivityTimer.isStarted = true;
		
		function randomColor(range) {
			var maxDomain = 40, 
				randomNumber = Math.floor((Math.random()*maxDomain)+1),
				scale = d3.scale.linear().domain([1,maxDomain]).range(range);
				
			return scale(randomNumber);	
		}		
	}	
	
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
	
	/* formats csv or json data to DataMaps format */
	function formatToDataMaps(data, type) {
		if (type == "json") {
			// only json needs to be re-mapped due to shorter field names to save file space
			data = _.map(data, function(row) {
				return {
					id: row.id,
					latitude: row.la,
					longitude: row.lo,
					city: row.ci,
					state: row.st
				};
			});
		}
		return data;
	}

	/* converts possible class names to names that are allowable */
	function getProtectedClassName(className) {
		// convert spaces to an allowable class name
		className = className.toLowerCase().replace(/\s/g, "-space-")
		// replace parenthesis
		className = className.toLowerCase().replace(/[()]/g, "")
		return className;
	}

	/* highlights beginsWith row and related bubbles on map */
	function highlightBeginsWith() {
		var $this = d3.select(this),
			className = getProtectedClassName($this.data()[0].beginsWith), 
			highlightClassName = map.options.bubblesConfig.highlightClassName;

		// check to make sure that we have a row with data in it
		if( $this.data()[0].count > 0 ) {
			// highlight row
			$this.classed("highlight", true);

			// highlight matching bubbles
			d3.selectAll("circle." + className).classed("highlight", true);

			// ensures that highlighted bubbles are sorted to the top layer of the map
			// this prevents a situation where a highlighted city is obscured by an svg circle that was drawn later				
			d3.selectAll("circle.datamaps-bubble")
				.sort(function (a, b) {
					var circle = d3.select("#c" + a.id); 
					// check to see if bubble has highlight class
					return (circle && circle.attr("class").split(" ").indexOf(highlightClassName) >= 0) ? 1 : 0;       											  
				});
		}			
	}
	
	function unHighlightBeginsWith() {
		var $this = d3.select(this),
			className = getProtectedClassName($this.data()[0].beginsWith);
		
		// unhighlight row
		$this.classed("highlight", false);
		
		// unhighlight bubbles
		d3.selectAll("circle." + className).classed("highlight", false);			
	}

	/* resets bubble border/fill colors to match */
	function resetInactivityChanges() {
      var options = map.options.bubblesConfig;
      
      // unhighlight any auto-highlighted begins with entries
      changeBeginsWith(true);
      
		d3.selectAll("circle.datamaps-bubble:not(.highlight)")
			.transition()
			.duration(400)
			.style("fill", options.borderColor)
			.style("stroke", options.fillColor);
			
		toConsole("reset bubble color: " + options.fillColor + "," + options.borderColor);
		
		inactivityTimer.isStarted = false;	
	}

	/* restarts interval timer to change the color of bubbles on the map */
	function resetInactivityTimer() {
		// called whenever mouse activity occurs
		// undo any changes done to the map while the mouse was inactive
		if(inactivityTimer.isStarted) resetInactivityChanges();
	
		// check if inactivity timer has already been set
		if(inactivityTimer.isPolled) return;

		// prevents clearing the timer excessively (for every move of the mouse)
		// it causes an inactivity timeout checker to be reset once every 500ms (if there is mouse activity)
		setTimeout(function() {
			inactivityTimer.isPolled = false;
		}, 500);
		
		// clear inactivity timer if it has been set
		if(inactivityTimer.timerObj) {
			clearTimeout(inactivityTimer.timerObj);
			inactivityTimer.timerObj = null;	
		}

		// clear transition interval if it has been set
		if(inactivityTimer.intervalObj) {
			clearInterval(inactivityTimer.intervalObj);
			inactivityTimer.intervalObj = null;
		}
		
		// restart inactivity timer
		inactivityTimer.isPolled = true;
		
		// change bubble colors due to mouse inactivity
		inactivityTimer.timerObj = setTimeout(function() {
			changeBubbleColors();
			// interval should be slightly longer than time it takes to transition bubble colors
			inactivityTimer.intervalObj = setInterval(function() {
				// auto-select a beginsWith entry
				changeBeginsWith();

				// change bubble colors
				changeBubbleColors();
			}, inactivityTimer.bubbleTransitionTime + 500);
		}, inactivityTimer.delayTime);
		
		// restart timer on mouse movement
		d3.select("body").on("mousemove", arguments.callee);
	}

	/* reduces dataset size, so as not to overwhelm the map with too many data points */
	function sampleData(data) {
		return _.sample(data, maxSampleSize);
	}

	/* sets up the initial map after a dataset has been loaded from JSON or CSV */
	function setupMap(data, type) {
		// format the data for the topojson format
		var allCities = formatToDataMaps(data, type),
			refreshingMap = false;
	 
	 	// update bubbles on map
		filterCities(allCities, cityInput.getValue());

		// event handler for when city name is changed
		cityInput.onChange(function() {
			var self = this;

			// restart color changer
			resetInactivityTimer();
			
			// prevents the map from being repeatedly refreshed when 
			// multiple input events are fired in a short period
			if(!refreshingMap) {
				refreshingMap = true;
				setTimeout(function() {
					filterCities(allCities, self.value);
					refreshingMap = false;
				}, 800);
			}
		});
		
		d3.select("button.reset").on("click", function() {
			cityInput.reset();
		});
	}
	
	/* shows table of city counts based on the next beginsWith character */
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
			.on("mouseover",  highlightBeginsWith)
			.on("mouseout", unHighlightBeginsWith)
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
		});
		
		// remove invalid cells
		cells
			.exit()
			.remove();
		
		// remove invalid rows
		rows
			.exit()
			.remove();
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
		
		// set new bubble radius based on # of bubbles on map
		map.options.bubblesConfig.bubbleRadius = radiusScale(data.length);
		
		map.bubbles(data, {
			popupTemplate: function (geo) {
				return '<div class="hoverinfo">' + geo.city +
					', ' + geo.state + '</div>';
			}
		})
			.attr("id", function(d) {return "c" + d.id;});		
	} 

	/* updates the text statistics below the graph */
	function updateStats(data, timer) {
		timer.stop();
		d3.selectAll(".execution_time").text(timer.time);
		d3.selectAll(".record_count").text(data.length);
	}
	
/* Events */
	function onAnimationComplete() {
		// fires when animation changes (such as bubble drawing) on map have completed
	}
	
	function onBubbleDraw() {
		var currentValue = cityInput.getValue(),
			city = this.data()[0].city,
			className = getProtectedClassName(city.substring(0, currentValue.length + 1)),
			classes = this.attr("data-baseClass");
		
		// save original classes
		if(!classes) {
			classes = this.attr("class");
			this.attr("data-baseClass", classes)
		};
		
		classes += " " + className;
		
		// add beginsWith + 1 character as class name
		this.attr("class", classes);
	}
	
	function onBubbleMouseOver(bubbles) {
		var self = this;
		// sorts bubbles so that "hovered" ones are placed on top of non-hovered	
		bubbles
			.sort(function (a, b) {
				if ( a.id != self.attr("id") ) return -1;  // a is not the hovered element, send "a" to the back
				else return 1;                             // a is the hovered element, bring "a" to the front
			});	
	}

	function onDataMapLoad(datamap) {
		// debugging - write state to console
		datamap.svg.selectAll(".datamaps-subunit").on("click", function(geo) {
			toConsole(geo.properties.name);
		});

		// start inactivity timer 
		// (inactivity causes bubbles to change color and other automatic activities)
		resetInactivityTimer();
	}			

/* CityInput Class */
	function CityInput() {
		var inputField = d3.select("#city"),
			onChangeCallback = function() {};
		
		// public methods
		this.getValue = function() {
			var val = inputField.property("value");
			return (val) ? val : "";
		};
	
		this.onChange = function(callback) {
			onChangeCallback = callback;
		}

		this.reset = function() {
			this.setValue("");
			setValueToSession(this.value);
			onChangeCallback.apply(this);
		}

		this.setValue = function(value) {
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
			onChangeCallback.apply(this);
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