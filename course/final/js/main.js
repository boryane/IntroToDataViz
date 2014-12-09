(function() {
	// changeable settings
	var 
		borderColorRange = ["#5f9ea0", "#0000ff"],
		fillColorRange = ["#00bfff", "#191970"],
		inactivityTimer = {
			delayTime: 5000, // milliseconds of no mouse activity before timer starts
			bubbleTransitionTime: 3000 // milliseconds between changing bubble colors
		},
		mapPath = "data/cities.csv",
		maxRadius = 9, // maximum size of a bubble
		maxSampleSize = 5000, // maximum # of cities to load on the map at one time
		minRadius = 1, // minimum size of a bubble
		loggingEnabled = true, // writes additional message to console.log
		startColor = "#1e50ff" // initial bubble color;

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
				bubbleMouseOut: onBubbleMouseOut,
				bubbleMouseOver: onBubbleMouseOver,
				bubbleRadius: minRadius,
				borderColor: startColor,
				borderWidth: 1,
				fillColor: startColor,
				fillOpacity: 0.5,	
				highlightClassName: "highlight",
				highlightOnHover: false,
				popupOnHover: false
			},
			done: onDataMapLoad		 
		});
	
	// load data and initialize Map
	d3.csv(mapPath, function(data) {setupMap(data, "csv");});

/*** Functions ***/

	/* uses the DataMap library to refresh the bubbles on map */
	function callDataMapLib(data) {
		var radiusScale = d3.scale.pow().exponent(.2)
			.domain([1, maxSampleSize])
			.rangeRound([maxRadius, minRadius]);
		
		// set new bubble radius based on # of bubbles on map
		map.options.bubblesConfig.bubbleRadius = radiusScale(data.length);
		
		// refresh bubbles and add an id
		map.bubbles(data)
			.attr("id", function(d) {return "c-" + d.id;});		
	}

	/* automatically picks a beginsWith row and highlights corresponding bubbles (cities) */
	function changeBeginsWithTable(reset) {
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

			// assign the listIndex
			if(this.listIndex === undefined || listSizeChanged || (this.listIndex + 1) >= this.listSize)
				this.listIndex = 0; // initialize or start at the beginning
			else
				this.listIndex = this.listIndex + 1; // go to the next list item
		
			highlightItem = d3.select(list[0][this.listIndex])
				.each(highlightBeginsWith);

			list
				.filter(function(d) {
					return d.beginsWith != getDataValue(highlightItem, "beginsWith");
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

	/* shows table of city counts based on the next beginsWith character */
	function drawBeginsWithTable(data) {
		var beginsWith = removeExactMatchChars(cache.beginsWith);
			table = d3.selectAll("#citylist table"),
			totalRecords = data.length;

		// count records by grouping next beginsWith + next character
		var nodeRollup = d3.nest()
			.key(function(d) {
				return getBeginsWithClassName(d.city, beginsWith.length + 1); 
			})
			.rollup(function(leaves) {return leaves.length;})
			.entries(data)
			.map(function(d) {
				return {
					beginsWith: d.key, 
					count: d.values,
					percentage: d.values / totalRecords
				};			
			})
			.sort(function(a, b) { 
				return d3.descending(a.count, b.count); 
			});

		if(totalRecords == 0) {
			// no cities matched
			nodeRollup = [{
				beginsWith: "(no matched cities)",
				count:0,
				percentage:0.0
			}];
		}
	
		var columns = d3.keys(nodeRollup[0]);

		// databind rows
		var rows = table.selectAll("tr").data(nodeRollup);

		// enter new rows
		rows
			.enter()
			.append("tr")
			.on("mouseover",  highlightBeginsWith)
			.on("mouseout", unHighlightBeginsWith)

		// enter + update
		rows
			.attr("id", function(d) {
				return getBeginsWithClassName(d.beginsWith);
			})
			.style("opacity", 0)			
			.transition()
			.duration(500)
			.style("opacity", 1);
		
		// databind cells
		var cells = rows.selectAll("td")
			.data(function(d) {
				return columns.map(function (column) {
					return {
						key: column, 
						value: d[column]
					};
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

				// replace unfriendly characters for display in UI
				value = value.replace(/__/g, "\"").replace(/-space-/g, " ");
				
				if(value.slice(-1) == "\"") {
					// exact match due to last character being "
					text += value;
				}
				else if (totalRecords > 0) {
					// partial match
					text = value.substring(0, value.length - 1);
					lastChar = value.slice(-1).replace(" ", "[space]");
					text += "<span class='nextChar'>" + lastChar + "</span>";
				}
				else {
					// no matches
					text += value;
				}		
			}
			else if (i == 1) {
				// second column - count
				if(totalRecords > 0) text += numberWithCommas(value);
			}
			else if (i == 2) {
				// third column - percentage
				if(totalRecords > 0) text += "(" + (Math.round(value * 10000.0) / 100) + "%)";				
			}
			
			return text;
		});
		
		// remove unbound rows
		rows
			.exit()		
			.remove();
			
		function numberWithCommas(n) {
			return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}
	}

	/* draws text label boxes next to bubbles on the map */
	function drawLabelBoxes(data, className) {
		var labelPadding = 3,
			count = data.length;

		// map fields that will be used in labels
		data = data.map(function(d) {
			var bubble = d3.select("#c-" + d.id),
				rect = bubble.node().getBoundingClientRect(),
				radius = bubble.attr("data-newRadius") || bubble.attr("r");
			return {
				id: d.id,
				cx: parseInt(bubble.attr("cx")),
				cy: parseInt(bubble.attr("cy")),
				r: parseInt(radius),
				x: rect.left,
				y: rect.top,
				text: d.city + ", " + d.state
			};
		});
		
		var labels = map.svg.selectAll("g.labels")
			.selectAll("g." + className)
			.data(data);
		
		// enter
		labels
			.enter()
			.append("g")
			.attr("id", function(d) {
				return "l-" + d.id;
			})
			.attr("class", className);

		// add label text
		var texts = labels
			.append("text")
			.attr("dx", function(d) {
				return d.cx + d.r + (labelPadding + 2);
			})
			.attr("dy", function(d) {
				return d.cy + (d.r / 2);
			})
			.text(function(d) {
				return d.text;
			});

		// add label box
		texts
			.each(function(d) {
				var bbox = this.getBBox(),
					fillOpacity = (className.indexOf("c-") == 0) ? 1 : null;
				var rect = d3.select(this.parentNode)
					.insert("rect", ":first-child")
					.attr("x", bbox.x - labelPadding)
					.attr("y", bbox.y - (labelPadding / 2))
					.attr("width", bbox.width + (labelPadding * 2))
					.attr("height", bbox.height + (labelPadding));
					
				// increases opacity of bubbles that have been highlighted via a mouseover
				rect.style("fill-opacity", fillOpacity);
			});

		// remove any unhighlighted labels
		labels
			.exit()
			.remove();	
	}

	/* returns data that starts with the "beginsWith" parameter */
	function filterData(data, beginsWith) {
		if(beginsWith && beginsWith.length > 0) {			
			if( /^\"[^\"]+\"$/.test(beginsWith) ) {
				// exact match
				beginsWith = removeExactMatchChars(beginsWith);
				data = _.filter(data, function(d) {
					return (d.city.toLowerCase() == beginsWith);
				});			
			} else {	
				// partial match
				data = _.filter(data, function(d) {
					return (d.city.toLowerCase().indexOf(beginsWith) == 0);
				});
			}	
		}	
		return data;
	}
	
	/* formats csv or json data to DataMaps format */
	function formatToDataMaps(data, type) {
		if (type == "json") {
			// only json needs to be re-mapped due to shorter field names to save file space (lodash)
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

	/* returns a valid CSS classname that is derived from a partial or exact beginsWith key */
	function getBeginsWithClassName(value, length) {
		var length = (length === undefined) ? value.length : length,
			className = value.substring(0, length).toLowerCase();

		if(value.length == (length - 1))
			// exact match, use "__" to represent exact string match
			className = "__" + className + "__";

		// convert multiple spaces to an allowable "class" name
		className = className.toLowerCase().replace(/\s+/g, "-space-");
		
		// replace parenthesis
		className = className.replace(/[()]/g, "");

		return className;
	}

	/* gets a specific data value from a D3 selection */
	function getDataValue(selection, key) {
		return selection.data()[0][key];
	}

	/* hide loading animation */
	function hideLoader() {
		d3.select(".loader")
			.style("opacity", 1)
			.transition()
			.duration(300)
			.style("opacity", 0)
			.transition()
			.duration(100)
			.style("display", "none");	
	}
	/* show loading animation */
	function showLoader() {
		d3.select(".loader")
			.interrupt()
			.style("opacity", 1)
			.style("display", "block");	
	}

	/* highlights beginsWith row and related bubbles */
	function highlightBeginsWith() {
		var row = d3.select(this),
			beginsWithClassName = row.attr("id"), 
			highlightClassName = map.options.bubblesConfig.highlightClassName;

		// check to make sure that we have a row with data in it
		if( getDataValue(row, "count") > 0 ) {
			// highlight row
			row.classed(highlightClassName, true);

			// parent node of bubbles
			var bubblesNode = d3.select("g.bubbles").node();	

			var bubbleList = d3.selectAll("circle.datamaps-bubble." + beginsWithClassName)
				// highlight matching bubbles
				.classed(highlightClassName, true)			
				// moves highlighted bubbles to the end of their parent element to ensure they are visible
				// (svg elements are layered by DOM order)
				.remove()
				.each(function(d) {
					bubblesNode.appendChild(this);
				});					
			
			// sample a random subset of bubbles (lodash)
			bubbleList = _.sample(bubbleList.data(), 30)
			
			drawLabelBoxes(bubbleList, beginsWithClassName);
		}
	}
	/* removes highlighted beginsWith row and matching bubbles */
	function unHighlightBeginsWith() {
		var row = d3.select(this),
			beginsWithClassName = row.attr("id"), 
			highlightClassName = map.options.bubblesConfig.highlightClassName;
		
		// unhighlight row
		row.classed(highlightClassName, false);
		
		// remove highlighted label elements
		d3.selectAll("g.labels g." + beginsWithClassName).remove();
		
		// unhighlight bubbles
		d3.selectAll("circle.datamaps-bubble." + beginsWithClassName).classed(highlightClassName, false);			
	}

	/* removes double quotes (used for exact match searches) */
	function removeExactMatchChars(value) {
		return (value && value.length > 0) ? value.replace(/\"/g, "") : value;
	}

	/* resets bubble border/fill colors to match */
	function resetInactivityChanges() {
      var options = map.options.bubblesConfig;
      
      // unhighlight any auto-highlighted begins with entries
      changeBeginsWithTable(true);
      
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
		
		// set timeout when no mouse activity is detected
		inactivityTimer.timerObj = setTimeout(function() {
			onMouseInactive();
			// interval should be slightly longer than time it takes to transition bubble colors
			inactivityTimer.intervalObj = setInterval(
				onMouseInactive, 
				inactivityTimer.bubbleTransitionTime + 500);
		}, inactivityTimer.delayTime);
		
		// restart timer on mouse movement
		d3.select("body").on("mousemove", arguments.callee);
	}

	/* returns a dataset with a maximum (sample) # of records */
	function sampleData(data, beginsWith) {
		var beginsWithLength = (beginsWith || "").length;
		
		if(beginsWithLength > 0) {			
			data = filterData(data, beginsWith);
		}
		
		// lodash chaining
		return _(data)
			.chain()
			// group by beginsWith+1 character (the next possible character match)
			.groupBy(function(d) {
				return d.city.slice(0, beginsWithLength + 1).toLowerCase();
			})
			// include at least 30 entries for each group
			.reduce(function(result, d) {
				return result.concat(d.slice(0, 30));
			}, [])
			// add in a sample (random set) of the entire dataset
			.union(
				_.sample(data, maxSampleSize)
			)
			.value();
	}

	/* sets up the initial map after a dataset has been loaded from JSON or CSV */
	function setupMap(data, type) {
		// format the data for the topojson format
		var allCities = formatToDataMaps(data, type),
			refreshingMap = false,
			svg = map.svg;
	 
	 	// update bubbles on map
		updateMap(allCities, cityInput.getValue());

	 	// add labels group element
		map.svg.append("g").attr("class", "labels"); 

		// event handler for when city name is changed
		cityInput.onChange(function() {
			var self = this;

			// shows loading animation
			showLoader();

			// restart color changer
			resetInactivityTimer();
			
			// prevents the map from being repeatedly refreshed when 
			// multiple input events are fired in a short period
			if(!refreshingMap) {
				refreshingMap = true;
				setTimeout(function() {			
					// update city in hash
					window.location.hash = new UrlHash().add("begins-with", self.value).toString();
					
					// update map		
					updateMap(allCities, self.value);
					refreshingMap = false;
				}, 1000);
			}
		});
		
		d3.select("button.reset").on("click", function() {
			cityInput.reset();
		});
	}
	
 	/* logs text to console if logging is enabled */
	function toConsole(text) {
		if(loggingEnabled) console.log(text);
	}	

	/* updates the data to only show cities beginning with "beginsWith" */
	function updateMap(data, beginsWith) {
		var timer = new Timer();
		
		if(beginsWith && beginsWith.length > 0) {
			// check to see if we can re-use cached data
			if(cache.data.length > 0 && 
					beginsWith.indexOf(cache.beginsWith) == 0 && 
					cache.data.length < maxSampleSize) data = cache.data;
		
			// store search text
			cache.beginsWith = beginsWith.toLowerCase();
			
			// return new data
			cache.data = sampleData(data, cache.beginsWith);
		} else {
			// empty city search, sample from all data
			cache.beginsWith = "";
			cache.data = sampleData(data);
		}

		// refresh bubbles on map	
		callDataMapLib(cache.data);

		// fire data refreshed event
		onDataRefreshed();
		
		// show table on right side
		var tableData = (cache.data.length < maxSampleSize) ? cache.data : data;
		tableData = filterData(tableData, cache.beginsWith);
		drawBeginsWithTable(tableData);
		
		// update text stats at bottom of map		
		updateStats(cache.data, timer);
	}

	/* updates the text statistics below the graph */
	function updateStats(data, timer) {
		timer.stop();
		d3.selectAll(".execution_time").text(timer.time);
		d3.selectAll(".record_count").text(data.length);
	}
	
/* Events */

	/* fires when animation changes (such as bubble drawing) on map have completed */
	function onAnimationComplete() {
	}
	
	/* fires when a bubble is drawn to the map */
	function onBubbleDraw() {
		var $this = d3.select(this),
			currentValue = removeExactMatchChars(cityInput.getValue()),
			city = getDataValue($this, "city"),
			className = getBeginsWithClassName(city, currentValue.length + 1),
			classes = $this.attr("data-baseClass");
		
		// save original classes
		if(!classes) {
			classes = $this.attr("class");
			$this.attr("data-baseClass", classes)
		};
		
		classes += " " + className;
		
		// add beginsWith + 1 character as class name
		$this.attr("class", classes);
	}

	/* fires when the mouse pointer leaves a bubble */
	function onBubbleMouseOut() {
		var bubble = d3.select(this),
			bubbleId = bubble.attr("id"),
			options = map.options.bubblesConfig,
			radius = bubble.attr("data-originalRadius");

		// restore bubble to original size
		bubble
			.classed(options.highlightClassName, false)
			.style("fill-opacity", options.fillOpacity)		
			.transition()
			.duration(400)
			.attr("r", radius)
			.each(function() {
				// return opacity to their original state
				d3.selectAll("g.bubbles circle")
					.style("opacity", null);			
			});

		// remove highlighted label element
		d3.selectAll("g.labels g." + bubbleId).remove();	
	}

	/* fires when the mouse pointer moves over a bubble */
	function onBubbleMouseOver() {
		var bubble = d3.select(this),
			bubbleId = bubble.attr("id"),
			options = map.options.bubblesConfig,
			originalRadius = parseInt(bubble.attr("data-originalRadius") || bubble.attr("r"));
			newRadius = originalRadius + 3;

		// move current bubble to the end of the parent element, so that it is fully visible
		bubble
			.remove()
			.each(function(d) {
				d3.select("g.bubbles").node().appendChild(this);
			})
			// apply highlight css class
			.classed(options.highlightClassName, true)
			// save original radius
			.attr("data-originalRadius", originalRadius)
			// save new radius so that it can be accessed in drawLabelBoxes
			.attr("data-newRadius", newRadius)
			.style("opacity", 1)
			.style("fill-opacity", 1)
			.transition()
			.duration(200)
			.attr("r", newRadius);

		// reduce opacity of non-highlighted bubbles
		d3.selectAll("g.bubbles circle:not(#" + bubbleId + ")")	
			.style("opacity", 0.5);
		
		drawLabelBoxes(bubble.data(), bubbleId);		
	}
	
	function onDataRefreshed() {
		// hides loading animation
		hideLoader();		
	}

	/* fires when the data map is first loaded */
	function onDataMapLoad(datamap) {	
		// debugging - write state to console
		datamap.svg.selectAll(".datamaps-subunit").on("click", function(geo) {
			toConsole(geo.properties.name);
		});

		// start inactivity timer 
		// (inactivity causes bubbles to change color and other automatic activities)
		resetInactivityTimer();
	}
	
	/* fires when the mouse has been inactive for a certain period of time */
	function onMouseInactive() {
		// auto-select a beginsWith entry
		changeBeginsWithTable();
		// change bubble colors
		changeBubbleColors();		
	}		

/* CityInput Class */
	function CityInput() {
		var inputField = d3.select("#begins-with"),
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
			var value = "",
				hash = new UrlHash();
			this.setValue("");
			setValueToSession(this.value);
			window.location.hash = hash.empty().add("begins-with", "").toString();
			onChangeCallback.apply(this);
		}

		this.setValue = function(value) {
			inputField.property("value", value);
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
		this.setValue(function() {
			var hash = new UrlHash();
			if(hash.count() > 0 && hash.value("begins-with")) {
				return hash.value("begins-with");
			} else {
				return getValueFromSession();			
			}
		});
	
		// event handler for when input field changes
		inputField.on("input", function() {
			var value = this.value;				
			setValueToSession(value);
			onChangeCallback.apply(this);
		});
	}

/* Timer Class */
	function Timer() {
		var start, end;
		this.reset = function() {
			start = end = new Date().getTime();
			return this;
		};
		this.start = function() {
			start = new Date().getTime();
			return this;
		};
		this.stop = function() {
			end = new Date().getTime();
			this.time = end - start;
			return this;
		};
		this.time = 0;
		this.reset();		
	}
	
/* UrlHash Class */
	function UrlHash() {
		var de = decodeURIComponent, en = encodeURIComponent,
			self = this,
			params;
		
		this.add = function(key, value) {
			params[key] = value;
			return self;
		}
		
		// how many hashed values are there
		this.count = function() {
			var size = 0, key;
			for (key in params) {
			  if (params.hasOwnProperty(key)) size++;
			}
			return size;
		};
		
		this.empty = function() {
			params = {};
			return self;
		}
		
		// return an object of all hash values
		this.nameValues = function() {
			return params;
		};
		
		// update hash object based on current url hash
		this.refresh = function() {
			parseToObject(window.location.hash);
			return self;
		}
		
		// convert to string
		this.toString = function() {
			var hash = "", key, value;
			for (key in params) {
				value = params[key];
				hash += "&" + en(key);
				if(value !== undefined)
					hash += "=" + en(value);
			}
			if(hash.charAt(0) == "&") hash = hash.substring(1);
			return hash.replace(/\%20/g, "+");
		};
		
		this.value = function(key) {
			return params[key];
		}
		
		function parseToObject(hash) {
			var pair, key, value;
			
			// reset
			self.empty();

			// remove preceding # character and correct spaces
			hash = hash.substring(hash.indexOf("#") + 1).replace(/\+/g, " ");
			
			// split
			if(hash.length > 0) {
				hash = hash.split("&");
				// parse individual name/values
				for (var i = 0; i < hash.length; i++) {
					pair = hash[i].split('=');
					key = pair[0];
					value = pair[1];
					if(value !== undefined) value = de(value);
					params[de(key)] = value;
				}
			}
		}
		
		// initialize
		this.refresh();
	}	
	
})();