var port = 3000,
	express = require('express'),
    bodyParser = require('body-parser'),
    app = express(),
    server = require('http').createServer(app),
	io = require('socket.io').listen(server, { log: false }),
    _ = require('./client/resources/js/libs/lodash-v4.0.15'),
    request = require('request-promise'),
	feeds = {};

//Read server port from input args
_(process.argv)
	.map(function (arg) { return arg.indexOf('port=') == 0 ?
			arg.substring('port='.length, arg.length) : undefined })
	.filter(function(port) { return !_.isUndefined(port); })
	.at([0])
	.forEach(function(finalPort) { if (!_.isUndefined(finalPort)) port = finalPort; });
console.log('port ', port);

//Request and responses body as JSON
app.use(bodyParser.json());

//Server main page
app.get('/', function (req, res) {
    res.sendfile(__dirname + '/client/index.html');
});

//Serve resources
app.use('/resources', express.static(__dirname + "/client/resources"));

/************** Data management functions **************/
var discoverFeeds = function(feedExclusions) {
    return _.pickBy(feeds, function(feed, feedId) {
        return (feedExclusions || []).indexOf(feedId) < 0;
    });
};

var fetchFeedItem = function(fetchParams, callback, errorCallback) {
    if (_.isUndefined(fetchParams.feedId)) {
        return errorCallback('FeedId param is mandatory');
    }
    var feed = feeds[fetchParams.feedId];
    if ( _.isUndefined(feed)) {
        return errorCallback('Could not find feed ' + fetchParams.feedId);
    }
    var url = _.reduce(_.keys(fetchParams), function(url, fetchParamKey) {
        return url.replace('#' + fetchParamKey + '#', fetchParams[fetchParamKey]);
    }, feed.templateUrl);
    if (/#[a-zA-Z]+#/.test(url)) {
        return errorCallback('Some fetch params are missing: [' + getMatches(url, /(#[a-zA-Z]+#)/g).join(', ') + ']');
    }
    log('URL: ' + url);
    request({
        'url': url,
        'method': 'GET',
        'headers': {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Safari/537.36'
        },
        json: true
    }).then(function(feedItem){
        if (callback) {
            callback(feedItem);
        }
    }).catch(function(err) {
        return errorCallback(err);
    });
};

var addFeed = function(feed) {
    log('Adding feed ' + feed.feedId);
    feeds[feed.feedId] = feed;
    return feed;
};

/************** Utility functions **************/
var log = function(message) {
    console.log(new Date().toLocaleTimeString() + ' - ' + message);
};

var logError = function(message) {
    console.error(new Date().toLocaleTimeString() + ' - ' + message);
};

var uuid = function () {
    var s4 = function () {
        return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (s4()+s4()+"-"+s4()+"-"+s4()+"-"+s4()+"-"+s4()+s4()+s4());
};

function getMatches(string, regex, index) {
    index || (index = 1);
    var matches = [];
    var match;
    while (match = regex.exec(string)) {
        matches.push(match[index]);
    }
    return matches;
}

/*********** SocketIO part **************/

io.sockets.on('connection', function (socket) {
    var clientId = uuid();
    var logPrefix = 'Client ' + clientId + ' - ';
    log(logPrefix + 'Connected');

	socket.on('discoverFeeds', function (feedsExclusions, callback) {
        if (callback) {
            var feeds = discoverFeeds(feedsExclusions);
            log(logPrefix + 'Discovered ' + _.keys(feeds).length + ' feeds, with ' + feedsExclusions.length + ' exclusions');
            callback({status: 200, feeds: feeds});
        }
	}).on('fetchFeedItem', function (fetchParams, callback) {
        log(logPrefix + 'Fetching ' + fetchParams.itemIndex + ' item from feed "' + fetchParams.feedId + '"');
        fetchFeedItem(fetchParams, function(feedItem) {
            if (callback) {
                callback({status: 200, feedId: fetchParams.feedId, itemIndex: fetchParams.itemIndex, feedItem: feedItem});
            }
        }, function(err) {
            logError('Item "' + fetchParams.itemIndex + ' item from feed "' + fetchParams.feedId + ' could not be fetched: ' + err);
            callback({status: 500, message: 'Feed item could not be fetched: ' + err});
        });
	})
	.on('disconnect', function(){
        log(logPrefix + 'Disconnected');
    });

    addFeed({
        feedId: 'resiAgentAPI: Agents',
        templateUrl: 'http://resi-agent-api.resi-lob-dev.realestate.com.au/agents?location=#suburbId#&page=#itemIndex#&size=1',
        suggestedTemplate: 'div.agentsId Agent ID: #{_embedded|||http://data.realestate.com.au/doc/relations#tieredResults|||0|||_embedded|||item|||0|||id}\n' +
            'div.agentsName #{_embedded|||http://data.realestate.com.au/doc/relations#tieredResults|||0|||_embedded|||item|||0|||name}\n' +
            '.agentsJobTitle #{_embedded|||http://data.realestate.com.au/doc/relations#tieredResults|||0|||_embedded|||item|||0|||jobTitle}\n' +
            'div.agentsAgencyName #{_embedded|||http://data.realestate.com.au/doc/relations#tieredResults|||0|||_embedded|||item|||0|||_embedded|||http://data.realestate.com.au/doc/relations#agency|||name}',
        suggestedCSSStyle: '.agentsId {font-size: 12px; color: grey; } ' +
            '.agentsName {font-size: 20px; font-weigth: bold; text-align: center; } ' +
            '.agentsJobTitle {font-size: 14px; color: grey; text-align: center; } ' +
            '.agentsAgencyName {font-size: 18px; text-align: center; background-color: #{_embedded|||http://data.realestate.com.au/doc/relations#tieredResults|||0|||_embedded|||item|||0|||_embedded|||http://data.realestate.com.au/doc/relations#agency|||branding|||primaryColor}; color: #{_embedded|||http://data.realestate.com.au/doc/relations#tieredResults|||0|||_embedded|||item|||0|||_embedded|||http://data.realestate.com.au/doc/relations#agency|||branding|||textColor}; }'
    });

    addFeed({
        feedId: 'listingServicesAPI: Listings - Buy',
        templateUrl: 'http://services.e2e.realestate.com.au/services/listings/search?query={%22channel%22:%22buy%22,%22localities%22:[{%22locality%22:%22#suburb#%22}],%22pageSize%22:%221%22,%22page%22:%22#itemIndex#%22}',
        suggestedTemplate: '==Buy section==\n' +
            'Listing ID: #{tieredResults|||0|||results|||0|||listingId}\n' +
            'Listing Address: #{tieredResults|||0|||results|||0|||address|||streetAddress} #{tieredResults|||0|||results|||0|||address|||suburb} #{tieredResults|||0|||results|||0|||address|||postCode} #{tieredResults|||0|||results|||0|||address|||state}\n' +
            'Property type: #{tieredResults|||0|||results|||0|||propertyType}\n' +
            'Agent name: #{tieredResults|||0|||results|||0|||lister|||name}\n' +
            'Agency name: #{tieredResults|||0|||results|||0|||agency|||name}\n' +
            'Price: #{tieredResults|||0|||results|||0|||price|||display}\n' +
            '#{tieredResults|||0|||results|||0|||generalFeatures|||bedrooms|||label}\n' +
            '#{tieredResults|||0|||results|||0|||generalFeatures|||bathrooms|||label}\n' +
            '#{tieredResults|||0|||results|||0|||generalFeatures|||parkingSpaces|||label}'
    });

    var addFeedAndNotify = function(feed) {
        addFeed(feed);
        io.sockets.emit('feedSuggestions', [feed]);
    };

    setTimeout(function() {
        addFeedAndNotify({
            feedId: 'listingServicesAPI: Listings - Sold',
            templateUrl: 'http://services.e2e.realestate.com.au/services/listings/search?query={%22channel%22:%22sold%22,%22localities%22:[{%22locality%22:%22#suburb#%22}],%22pageSize%22:%221%22,%22page%22:%22#itemIndex#%22}',
            suggestedTemplate: '==Sold section==\n' +
            'Listing ID: #{tieredResults|||0|||results|||0|||listingId}\n' +
            'Listing Address: #{tieredResults|||0|||results|||0|||address|||streetAddress} #{tieredResults|||0|||results|||0|||address|||suburb} #{tieredResults|||0|||results|||0|||address|||postCode} #{tieredResults|||0|||results|||0|||address|||state}\n' +
            'Property type: #{tieredResults|||0|||results|||0|||propertyType}\n' +
            'Agent name: #{tieredResults|||0|||results|||0|||lister|||name}\n' +
            'Agency name: #{tieredResults|||0|||results|||0|||agency|||name}\n' +
            'Price: #{tieredResults|||0|||results|||0|||price|||display}\n' +
            'Sold date: #{tieredResults|||0|||results|||0|||dateSold|||display}\n' +
            '#{tieredResults|||0|||results|||0|||generalFeatures|||bedrooms|||label}\n' +
            '#{tieredResults|||0|||results|||0|||generalFeatures|||bathrooms|||label}\n' +
            '#{tieredResults|||0|||results|||0|||generalFeatures|||parkingSpaces|||label}'
        })}, 10000);
});

server.listen(port);