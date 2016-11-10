window.onload = function() {
    var mapmargin = 50;
    $('#map').css("height", ($(window).height() - mapmargin));
    $(window).on("resize", resize);
    resize();
    document.getElementById('AddressForm').addEventListener('submit', function(ev) {
        ev.preventDefault();
        var addr = document.getElementById('addressInput').value;
        moveFire(addr);
    });

    function resize() {
        $('#map').css("height", ($(window).height() - (mapmargin + 12)));
        $('#map').css("margin-top", -21);
    }
    var fire;
    var water;
    var route;
    var routeLayer;
    var gpm, roundTripTime;
    var map = L.map('map', {
        attributionControl: false
    }).setView([39.12, -77.695], 12);
    var markers = [];
    var baseLayer = L.tileLayer('http://api.tiles.mapbox.com/v4/jasondalton.map-7z4qef6u/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoiamFzb25kYWx0b24iLCJhIjoiMnNBSWg4VSJ9.NMibCJgR_WkdcmfsD3ceGg', {
        attribution: 'Azimuth1',
        maxZoom: 22
    });
    var ggl = new L.Google('HYBRID');
    map.addLayer(ggl);
    var watersources;
    var baseballIcon = L.icon({
        iconUrl: 'baseball-marker.png',
        iconSize: [32, 37],
        iconAnchor: [16, 37],
        popupAnchor: [0, -28]
    });
    watersources = L.geoJson([sources], {
        style: function(feature) {
            return feature.properties && feature.properties.style;
        },
        onEachFeature: onEachFeature,
        pointToLayer: function(feature, latlng) {
            var ws = waterStyle(feature);
            return L.circleMarker(latlng, ws);
        }
    });
    watersources.addTo(map);
    var index = leafletKnn(watersources);
    var firePt = new L.latLng([39.115, -77.66]);
    fire = new cilogi.L.Marker(firePt, {
        draggable: true,
        fontIconSize: computeSizeFromZoom(),
        fontIconName: "\uf06D", // fire
        fontIconColor: "#990000",
        fontIconFont: 'awesome',
        opacity: 1
    })
    fire.addTo(map);

    function onEachFeature(feature, layer) {
        var popupContent = "";
        if (feature.properties) {
            popupContent += "<table>";
            popupContent += "<tr><td>First Due: </td><td>" + feature.properties.RW_FIRSTDU + "</td></tr>";
            popupContent += "<tr><td>Type: </td><td>" + feature.properties.RW_TYPE + "</td></tr>";
            popupContent += "<tr><td>Size: </td><td>" + feature.properties.RW_SIZE + "</td></tr>";
            popupContent += "</table>";
        }
        layer.bindPopup(popupContent);
    }

    function getValue(x) {
        return x === "TANK" ? "#ff8d00" :
            x === "POND" ? "#0078ff" :
            "#FFEDA0";
    }

    function waterStyle(feature) {
        return {
            color: "#0078ff",
            radius: 5,
            fillColor: getValue(feature.properties.RW_TYPE),
            weight: 1,
            opacity: 1,
            fillOpacity: 0.85
        };
    }

    function computeSizeFromZoom() {
        var max = map.getMaxZoom(),
            zoom = map.getZoom(),
            diff = max - zoom,
            table = [4, 2, 1];
        return (diff < table.length) ? table[diff] : 1;
    }

    function getNearestWater(fire, cb) {
        var candidateDist = [];
        var candidateRoutes = [];
        firePt = L.latLng(fire.getLatLng());
        var closest = index.nearest(firePt, 10);
        var count = 0;
        var length = closest.length;
        router = L.Routing.OSRM();
        console.log(router)
        closest.forEach(function(candidate) {
            var x = candidate.lat + " " + candidate.lon;
            waypoints = [{
                latLng: firePt
            }, {
                latLng: L.latLng(candidate.lat, candidate.lon)
            }];
            router.route(waypoints, function(err, routes) {
                count++;
                candidateDist.push(routes[0].summary.totalTime);
                candidateRoutes.push(routes[0]);
                if (count == length) {
                    cb(candidateDist, candidateRoutes);
                }
            })
        });
    }

    function compareRoutes(candidateDist, candidateRoutes) {
        function calcGPM(tankerCount, tankerCapacity, roundTripTime) {
            var fillTime = 2.5;
            var dumpTime = 2.5;
            var tempGpm = (tankerCount * tankerCapacity * 0.8) / (roundTripTime + dumpTime + fillTime);
            return tempGpm.toFixed(2);
        }
        var r = candidateRoutes[candidateDist.indexOf(Math.min.apply(Math, candidateDist))];
        gpm = calcGPM(document.getElementById('numTankers').value, document.getElementById('tankerCapacity').value, (r.summary.totalTime / 60) * 2);
        console.log("gpm," + gpm + "," + r.waypoints[0][0] + "," + r.waypoints[0][1]);
        routeLayer = L.Routing.line(r).addTo(map);
        infoString = "<a href='http://fireroute.us'><img src='img/fireroute-logo.png' alt='FireRoute'></a><h4>Information about the nearest water source.</h4><p class='lead'>GPM: " + gpm + "</p><p>Round trip: " + Math.round(r.summary.totalTime / 60, 2) + " minutes.</p><p><ol><li>";
        for (i = 0; i < r.instructions.length; ++i) {
            step = r.instructions[i];
            if (step.type == "DestinationReached") {
                infoString += "Arrive at Destination ";
                continue;
            }
            infoString += step.type + " " + step.direction + " on " + step.road + " for " + (step.distance * 0.000621371).toFixed(2) + " miles.</li><li></i> "; //multiply to go from meters to miles
        }
        infoString += "</li></ol></p>";
        document.getElementById('info').innerHTML = infoString;
        var waterPt = L.latLng([r.waypoints[1][0], r.waypoints[1][1]]);
        water = new cilogi.L.Marker(waterPt, {
            fontIconSize: computeSizeFromZoom(),
            fontIconName: "\uf043", //water drop
            fontIconColor: "#000099",
            fontIconFont: 'awesome',
            opacity: 1
        })
        water.addTo(map);
    };

    function moveFire(addr) {
        $.getJSON("https://maps.googleapis.com/maps/api/geocode/json?address=" + addr.split(' ').join('+') + "&bounds=-118.604794,34.172684|-118.500938,34.236144&key=AIzaSyA6UX3-mKx_AXCMZCH4h9sGHai3mc9SNV8", function(data) {
            var pt = data.results[0];
            fire.setLatLng([parseFloat(pt.geometry.location.lat), parseFloat(pt.geometry.location.lng)]);
            map.removeLayer(water);
            map.removeLayer(routeLayer);
            getNearestWater(fire, compareRoutes, addr);
        });
    }
    fire.on('dragend', function(event) {
        map.removeLayer(water);
        map.removeLayer(routeLayer);
        getNearestWater(fire, compareRoutes);
    });
    //getNearestWater(fire, compareRoutes);
    var USTopo = function(elem) {
        var activeState;
        var activeCounty;
        var activeFeature;
        var height = d3.select(elem).node().offsetHeight;
        var width = d3.select(elem).node().offsetWidth;
        var header = d3.select(elem).append("div").attr("class", "splashHeader"); //.style('top', '40px');
        stateText = header.append('div').attr("class", 'text-primary h1'); //.text('Select State');
        var countyText = header.append('div').attr("class", 'em h2'); //.text('Select State');;
        var startBtn = header.append('button').attr("class", 'btn btn-primary hide').text('Start FireRoute!');;
        var centered;
        var projection = d3.geo.albersUsa()
            .scale(1070)
            .translate([width / 2, height / 2]);
        var path = d3.geo.path()
            .projection(projection);
        var svg = d3.select(elem).append("svg")
            .attr("width", width)
            .attr("height", height);
        svg.append("rect")
            .attr("class", "background")
            .attr("width", width)
            .attr("height", height)
            .on("click", clicked);
        var g = svg.append("g");
        d3.json("data/us-topo-counties.json", function(error, us) {
            a = us
            d3.json("data/us-topo-states.json", function(error, st) {
                g.append("g")
                    .attr("id", "counties")
                    .selectAll("path")
                    .data(topojson.feature(us, us.objects['us-counties']).features)
                    .enter().append("path")
                    .attr("d", path)
                    .attr("class", "county-boundary")
                    .on("click", countyclicked)
                    .on("mouseover", mouseoverCounty);
                g.append("g")
                    .attr("id", "states")
                    .selectAll("path")
                    .data(topojson.feature(st, st.objects['us-states']).features)
                    .enter().append("path")
                    .attr("d", path)
                    .attr("class", "state")
                    .on("click", clicked)
                    .on("mouseover", mouseoverState);
                g.append("path")
                    .datum(topojson.mesh(st, st.objects['us-states'], function(a, b) {
                        return a !== b;
                    }))
                    .attr("id", "state-borders")
                    .attr("d", path);
            });
        });

        function mouseoverState(d, e) {
            if (activeState) {
                return;
            }
            d3.selectAll('.state').classed('hover', false);
            d3.select(this).classed('hover', true);
            stateText.text(d.properties.NAME);
            countyText.text('');
        }

        function mouseoverCounty(d) {
            if (!activeState || activeCounty) {
                return;
            }
            d3.selectAll('.county-boundary').classed('hover', false);
            d3.select(this).classed('hover', true);
            var type = d.properties.LSAD;
            countyText.text(d.properties.NAME + ' ' + type);
        }

        function clicked(d) {
            startBtn.classed('hide', true);
            d3.selectAll('path').classed('hover', false);
            d3.selectAll('path').classed('active2', false);
            countyText.text('');
            activeCounty = false;
            var x, y, k;
            if (d && centered !== d) {
                var centroid = path.centroid(d);
                x = centroid[0];
                y = centroid[1];
                k = 4;
                centered = d;
                activeState = d.properties.NAME;
                stateText.text(d.properties.NAME);
            } else {
                x = width / 2;
                y = height / 2;
                k = 1;
                centered = null;
                activeState = false;
                stateText.text('');
            }
            g.selectAll("path")
                .classed("active", centered && function(d) {
                    return d === centered;
                });
            g.transition()
                .duration(750)
                .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")scale(" + k + ")translate(" + -x + "," + -y + ")")
                .style("stroke-width", 1.5 / k + "px");
        }

        function countyclicked(d) {
            activeFeature = d;
            if (!activeState) {
                return;
            }
            d3.selectAll('.county-boundary').classed('hover', false);
            activeCounty = d.properties.NAME;
            var x, y, k;
            if (d && centered !== d) {
                var centroid = path.centroid(d);
                x = centroid[0];
                y = centroid[1];
                k = 9;
                centered = d;
                activeCounty = d.properties.NAME;
                var type = d.properties.LSAD;
                countyText.text(d.properties.NAME + ' ' + type);
            } else {
                x = width / 2;
                y = height / 2;
                k = 10;
                centered = null;
                activeCounty = false;
            }
            g.selectAll("path")
                .classed("active2", centered && function(d) {
                    return d === centered;
                });
            g.transition()
                .duration(750)
                .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")scale(" + k + ")translate(" + -x + "," + -y + ")")
                .style("stroke-width", 1.5 / k + "px");
            startBtn.classed('hide', false);
        }
        startBtn.on('click', function() {
            $('.topo').hide('slow');
            a = activeFeature;
            var coords = _.flatten(activeFeature.geometry.coordinates, 1)
            var countyBounds = L.latLngBounds(coords.map(function(d) {
                return L.latLng([d[1], d[0]]);
            }));
            //map.fitBounds(countyBounds);
            /*customLayer = L.geoJson(null, {
                style: function(feature) {
                    return {
                        fillOpacity: 0,
                        color: '#08415F',
                        weight: 8
                    };
                },
                filter: function(d, e) {
                    return d.properties.NAME === activeCounty;

                }
            }).on('ready', function() {
                map.fitBounds(customLayer.getBounds())
            }).addTo(map);
            var myLayer = omnivore.topojson("us-topo-counties.json", null, customLayer);*/
            //map.panTo(customLayer.getBounds().getCenter())
        });
    };
    USTopo('#splash');
    $('.topo').hide('slow');
}
