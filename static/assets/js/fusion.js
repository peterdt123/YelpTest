/* key urls */
var corsAnywhereUrl   = 'https://cors-anywhere.herokuapp.com/';
var yelpSearchUrl     = corsAnywhereUrl + "https://api.yelp.com/v3/businesses/search?"
                          + "latitude=LATITUDE&longitude=LONGITUDE&term=vegan,All&open_now=OPEN_NOW";
var yelpBusinessUrl   = corsAnywhereUrl + "https://api.yelp.com/v3/businesses/BUSINESS_ID";
var googleMapsDirUrl = "https://www.google.com/maps/dir/ORIGIN/DESTINATION";
var searchUrl          = yelpSearchUrl;

/* msg area user messages */
var msgReRun = "Updating results...";
var locError = "Required: address/loc or GPS.";
var mapError = "Location not found.";
var listError = "No results returned.";
var mobScroll = "(Scroll list for all results & click number.)";
var clearMsg = "";

var yelpList;
var origin;
var markers = [];
var vegList = [];
var busDetail = [];

/* utility constants */
var MOB_WIDTH = 600;
var MOB_WIDTH_TINY = 410;
var M2FT = 3.28084;
var MIFEET = 5280;
var MTKM = 1000;
var QRYLAPSE = 2000; // min millisecs between API queries


/* set sort direction for key criteria */
var sortRef = {};
sortRef["price"] = "asc";
sortRef["dist"] = "asc";
sortRef["rating"] = "desc";


var detDone = document.getElementById('done'); 


// application-level error handler:
function yelpQueryErr(err){
    alert("Error executing Yelp query - returned status code: " + err);
}

/* AJAX Yelp Fusion Query */
function queryFusion(searchUrl,inputs,postProc) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', searchUrl, true);
    // error function in case of failure (xaction/network-level)
    xhr.onerror = function(){       
        alert("Error: Transaction error occured while executing Yelp query.");
    };
    xhr.setRequestHeader("Authorization", "Bearer " + inputs); 
    xhr.onreadystatechange = function() {
       console.log(xhr.responseText);
       if (xhr.readyState == 4 && xhr.status == 200) {
        
        if ( postProc.name == "procResults" ) {
            yelpList = xhr.responseText;
        }
        postProc(xhr.responseText);

        } else if ( xhr.readyState == 4 && xhr.status !=200 ) {
            yelpQueryErr(xhr.status);
        }
    };
    xhr.send();
}


/* error handler/alert for credentials read failure */
function yelpReadError(status,error){
    var errMsg = "Error attempting to read yelp credentials - got: "+status+ " " + error;
    console.log(errMsg);
    alert(errMsg);
}


function fetchTerms(callback) {
    
    // exercise call limit to avoid gateway timeout:
    if ( sessionStorage.getItem("lastCall") != null ) {
        if ( (Date.now() - sessionStorage.getItem("lastCall")) < QRYLAPSE ) {
            return;
        }
    }
    sessionStorage.setItem("lastCall",Date.now());

    // request Yelp Fusion API credentials
    $.ajax({
        type: "POST",
        url: "/goYelp",
        success: callback,
        error: function(request, status, error) {
            yelpReadError(status,error);
        }
    });
}


function runBusQuery(terms) {
    queryFusion(searchUrl,terms,procBusResults);
}


function runQuery(terms) {
    if ( screen.width > MOB_WIDTH ) {       
        ViewModelMsg.msg(clearMsg);
    }
    document.getElementById('map').style.height = "100vh";
    queryFusion(searchUrl,terms,procResults);
}


function runFusionQuery(lat,lng) {  
    origin = { lat: lat, lng: lng};
    searchUrl = yelpSearchUrl.replace("LATITUDE",lat);
    searchUrl = searchUrl.replace("LONGITUDE",lng);
    searchUrl = searchUrl.replace("OPEN_NOW",ViewModelOpenNowQuery.openNow());
    fetchTerms(runQuery);
}


function formatDist(dist) {
    if ( ViewModelListDisplay.maxDistUnits() == "mi" ) {
        dist = (dist * M2FT) / MIFEET;
        return dist.toFixed(1)+" mi";
    } else {
        dist = dist / MTKM;
        return dist.toFixed(1)+" km";
    }
}


function getBusDistance(info) { 
    for ( mki=0; mki<markers.length; mki++) {
        var markerId = getYelpId(markers[mki].content); // showMarkers.js

        if ( markerId == info.id ) {
            var content = markers[mki].content;
            var beg = content.indexOf("Distance:")+10;
            var end = beg+content.substring(beg,content.length).indexOf("<br>");
            return content.substring(beg,end);
        }
    }
}


function getDirUrl(info) {
    var dirUrl = googleMapsDirUrl;
    for ( mki=0; mki<vegList.length; mki++) {
        if ( vegList[mki].id == info.id ) {
            var dest = vegList[mki].location;
            dirUrl = dirUrl.replace("ORIGIN",origin.lat+","+origin.lng);
            dirUrl = dirUrl.replace("DESTINATION",dest.lat+","+dest.lng);
            return dirUrl;
        }
    }
}

/* our data model for results obtained from querying business-specific details from Yelp search API  */
function procBusResults(info) {
    
    busDetail = [];
    info = JSON.parse(info);

    var open_now = "OPEN NOW";
    if ( info.hours ) {
        if ( ! info.hours[0].is_open_now ) {
            open_now = "CLOSED NOW";
        }
    } else {
        open_now = "UNKNOWN";
    }

    var photos = [];
    for ( phi = 0; phi < info.photos.length; phi++ ){
        photos.push(info.photos[phi]);
    }
    
    // distance not part of Yelp business query so we strip it from marker info
    var detDist = getBusDistance(info);

    // construct Google Maps Directions url
    var dirUrl = getDirUrl(info);

    busDetail = {
                    name: info.name,
                    url: info.url,
                    dir_url: dirUrl,
                    yelpLink: info.name + " (Yelp)",
                    phone: info.display_phone,
                    address: info.location.display_address,
                    price: info.price,
                    rating: info.rating,
                    dist: detDist,
                    review_count: info.review_count,
                    distance: detDist,
                    cross_st: info.location.cross_streets,
                    status: open_now,
                    mob_stats: info.price + " / " + info.rating + " ("+info.review_count+" reviews) / " + detDist,
                    photos: photos
    };

    ViewModelDet.runQuery(busDetail);
}


function procSkey(skey) {
    switch (ViewModelListDisplay.rankSort()) {
        case "dist": // asc
            skey = Number(skey.split(" ")[0]);
            return skey;
        case "price": // asc
            skey = skey.length;
            return skey;
        case "rating": // desc
            skey = Number(skey);
            return skey;
    }   
}


/* our data model for results obtained from Yelp search API  */
function procResults(info) {

    info = JSON.parse(info);
    
    vegList = {};
    var label = 1;
    for ( var loc = 0; loc < info.businesses.length; loc++) {

        var title   = info.businesses[loc].name;
        var lat     = parseFloat(info.businesses[loc].coordinates.latitude);
        var lng     = parseFloat(info.businesses[loc].coordinates.longitude);
        var price   = info.businesses[loc].price;
        var rating  = info.businesses[loc].rating;
        var dist    = formatDist(info.businesses[loc].distance);
        var id      = info.businesses[loc].id;
        var address = info.businesses[loc].location.display_address;

        var skey = eval(ViewModelListDisplay.rankSort());
        skey = procSkey(skey);
        

        if ( isNaN(lat) || isNaN(lng) || lat == null || lng == null ) {
            continue;
        }

        var content = " Price: " + price + " Rating: " + rating + " Distance: " + dist;
        var iwcontent = '<div id="mrkheader">'+title+'</div>'+'<hr>'+'<div id = "mrkinfo">' + content + '<br>'+address+'</div>'
                        + '<br>' + '<span id="yelp-id">'+ id +'</span>' + '<button id="launch_detail">Details</button>'
                        + '<span><img class="iw-yelp-logo" src="static/assets/img/logos/yelp_logo.png") }}" alt="yelp-logo"></span>';

        
        if ( ! ( skey in vegList) ) {
            vegList[skey] = {};
        }       
        vegList[skey][id] = {
                                title: info.businesses[loc].name,
                                location: {lat:lat, lng:lng},
                                dist: dist,                             
                                content: content,
                                iwcontent: iwcontent,
                                address: address,
                                id: id
                          };

    }

    ViewModelListDisplay.applyFilter();     
    ViewModelListDisplay.applySort();
    console.log(vegList);
    markers = setMarkers(vegList,origin);
    ViewModel.runQuery(vegList);

    prepLoad("visible");
}


function resetMarkers() {
    for (var iwn = 0; iwn < markers.length; iwn++){
        markers[iwn].setIcon(defIcon);
        markers[iwn]['infowindow'].close(map,markers[iwn]);
    }
}


function getInfoWindow(idx) {

    var marker = markers[idx];

    resetMarkers();
    
    /* change marker color when clicked/selected */
    var label = marker.getLabel();
    var icon = {
        url: 'https://maps.google.com/mapfiles/kml/paddle/grn-blank.png',
        scaledSize: new google.maps.Size(40,40)
    }
    marker.setIcon(icon);
    marker.setLabel(label);
    marker['infowindow'].open(map,marker);
    
    marker['infowindow'].addListener('closeclick',function(){
        document.getElementById('detail-pane').style.visibility = 'hidden';
        document.getElementById("map").style.height = "100vh";
        marker.setIcon(defIcon);
        marker.setLabel(label);
        marker['infowindow'].close(map,marker);
    });
}


function getBusInfo(idx) {
    if ( Number.isInteger(idx)) {
        searchUrl = yelpBusinessUrl.replace("BUSINESS_ID",vegList[idx].id);
    } else {
        searchUrl = yelpBusinessUrl.replace("BUSINESS_ID",idx);
    }   
    fetchTerms(runBusQuery);
}


function adjustView() {
    if ( screen.width < MOB_WIDTH ) {
        document.getElementById("map").style.height = "45vh";
        document.getElementById('detail-pane').style.height = "25vh";       
    } else {
        document.getElementById("map").style.height = "75vh";
    }
    document.getElementById('detail-pane').style.visibility = 'visible';
}


detDone.addEventListener('click',function(){
    document.getElementById('detail-pane').style.visibility = "hidden";
    document.getElementById('map').style.height = "100vh";
})



var ViewModelOpenNowQuery = {
    openNow: ko.observable(false),
    toggleOpenNow: function(){
        ViewModelMsg.msg(msgReRun);
        ViewModelQuery.launchQuery();
    }
}


var ViewModelListDisplay = {
    rankSort: ko.observable("dist"),
    maxDist: ko.observable("Max"),
    maxDistUnits: ko.observable("mi"),

    toggleMarkers: function(mode) {
        for (mki=0; mki<markers.length; mki++) {
            markers[mki].setVisible(mode);
        }
    },

    /* 
        Note: our filter is a unidirectional *numerical* filter meant to 
        constrain display results to a maximum distance. I have not seen any
        documentation on native knockout methods which address this specific 
        use-case scenario, unlike the many versatile string-based filtration
        methods for which many demonstrations exist.
    */

    applyFilter: function() {
        if ( this.maxDist() == "all") {
            return;
        }
        var fvegList = {};
        var sKeys = Object.keys(vegList);
        for ( ski=0; ski < sKeys.length; ski++ ){
            var idKeys = Object.keys(vegList[sKeys[ski]]);
            for ( idi=0; idi < idKeys.length; idi++) {
                if ( Number(vegList[sKeys[ski]][idKeys[idi]].dist.split(" ",1)) <= Number(this.maxDist()) ) {
                    if ( ! ( sKeys[ski] in fvegList) ) {
                        fvegList[sKeys[ski]] = {};
                    }
                    fvegList[sKeys[ski]][idKeys[idi]] = vegList[sKeys[ski]][idKeys[idi]];
                }
            }
        }
        vegList = {};
        vegList = fvegList;
    },

    applySort: function() {

        var sortDir = sortRef[this.rankSort()];     
        var sKeys = Object.keys(vegList);       

        if ( sortDir == "desc" ) {
            sKeys = sKeys.sort(function(a, b){return b - a});
        } else {
            sKeys = sKeys.sort(function(a, b){return a - b});
        }

        var svegList = [];
        var label = 1;
        for ( var kyi = 0; kyi < sKeys.length; kyi++ ) {
            idKeys = Object.keys(vegList[sKeys[kyi]]);
            for ( var kid = 0; kid < idKeys.length; kid++ ) {
                var rec = vegList[sKeys[kyi]][idKeys[kid]];
                rec["label"] = label.toString();
                svegList.push(rec);
                label++;
            }
        }
        vegList = [];
        vegList = svegList;
    },  

    reformat: function() {
        this.toggleMarkers(false);      
        procResults(yelpList);
        this.toggleMarkers(true);
    }

};


document.getElementById("map").addEventListener('click',function() {
    document.getElementById("floating-listings").style.height="12vh";
    document.getElementById("floating-listings").style.opacity="0.7";
});

document.getElementById("floating-listings").addEventListener('click',function() {
    document.getElementById("floating-listings").style.height="30vh";
    document.getElementById("floating-listings").style.opacity="1";
});


function prepLoad(mode) {
    var preloadDisplay = "none";
    var mapareaColor = "#24282B";
    if ( mode == "hidden" ) {
        preloadDisplay = "inline-block";
        mapareaColor = "#99FF33";
    }
    document.getElementById("listings").style.visibility = mode;
    document.getElementById("floating-listings").style.visibility = mode;
    document.getElementById("map").style.visibility = mode;
    document.getElementById("maparea").style.backgroundColor = mapareaColor;    
    document.getElementById("search").style.display = preloadDisplay;

}


function ViewModelQuery() { 
    var self = this;
    self.launchQuery = function(){

        prepLoad("hidden");

        if (ViewModelLoc.useGPS()) {    
                getGeolocation();    
        } else {    
          if ( ! ViewModelLoc.searchLoc() ) {
            if ( screen.width < MOB_WIDTH ) {
              alert(locError);
            } else {
              ViewModelMsg.msg(locError);
            }
          } else {
            getCred(credFile,geoCode);
          }
      }   
    }
    
}


/* view for our list */
function ViewModel() {
    
    var self = this;
    self.myList = ko.observableArray(vegList);  
    self.runQuery = function (listData) {

        // reset map & clear errors/msgs from previous xaction
        ViewModelMsg.msg(clearMsg); 
        document.getElementById("map").style.opacity = 1; // cosmetic change
        
        self.myList(vegList);
        if (vegList.length == 0) {
            if ( screen.width < MOB_WIDTH ) {
                alert(listError);
            } else {                
                ViewModelMsg.msg(listError);
            }
        } else if ( vegList.length > 1 && screen.width < MOB_WIDTH) {
            ViewModelMsg.msg(mobScroll);
            if ( screen.width <= MOB_WIDTH_TINY ) {
                document.getElementById("msg-area").style.fontSize = "10px";
            }
        } else {
            ViewModelMsg.msg(clearMsg);
        }
        
        self.busQuery = function(data,event) {          
            var idx = ko.contextFor(event.target).$index();         
            map.panTo(new google.maps.LatLng(vegList[idx].location.lat,vegList[idx].location.lng));
            getInfoWindow(idx);
            getBusInfo(idx);
        }
    }   

}


/* view for business-specific detail data */
function ViewModelDet() {
    var self = this;
    self.myDetail = ko.observableArray(busDetail);
    self.runQuery = function(busData) {
        self.myDetail(busDetail);
        adjustView();
    }

}

var ViewModelQuery = new ViewModelQuery();
ko.applyBindings(ViewModelQuery, document.getElementById("find"));

var ViewModel = new ViewModel();
ko.applyBindings(ViewModel, document.getElementById("listings"));
ko.applyBindings(ViewModel, document.getElementById("floating-listings"));

var ViewModelDet = new ViewModelDet();
ko.applyBindings(ViewModelDet, document.getElementById("detail-pane"));

ko.applyBindings(ViewModelOpenNowQuery,document.getElementById("filt-open-now"));
ko.applyBindings(ViewModelListDisplay, document.getElementById("opt-rank-by"));
ko.applyBindings(ViewModelListDisplay, document.getElementById("filt-max-dist"));
ko.applyBindings(ViewModelListDisplay, document.getElementById("filt-max-dist-unit"));
