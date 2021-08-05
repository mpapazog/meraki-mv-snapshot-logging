// SnapshotRequester.js

const Config                = require('./Config');
const Meraki                = require('./Meraki');
const SnapshotDownloader    = require('./SnapshotDownloader');

class SnapshotRequesterClass {
    constructor() {
        this.pendingRequests = [];
        this.requestProcessingTimeout = null;
        this.processingInterval = Config.merakiDashboardApi.snapshotRequestRetryIntervalSeconds * 1000;
        this.maxRetries = Config.merakiDashboardApi.maxSnapshotLinkFetchRetries;
        
        this.dashboard = new Meraki.MerakiClass(Config.merakiDashboardApi.apiKey);
    }
    
    push(serial, timestamp, self) {
        var item = {
            serial: serial,
            timestamp: timestamp,
            retry: 0
        };
        self.pendingRequests.push(item);
        if (self.requestProcessingTimeout == null) {
            self.requestProcessingTimeout = setTimeout(function() {
                self.processNextRequest(self);
            }, self.processingInterval);
        }
    }
    
    processNextRequest(self) {
        if (self.pendingRequests.length > 0) {
            console.log("SnapshotRequester: Fetching link for queue item 1/" + String(self.pendingRequests.length) + ":");
            console.log(self.pendingRequests[0]);
            
            //Syntax: generateDeviceCameraSnapshot (self, serial, body)
            var body = {timestamp: self.pendingRequests[0].timestamp};
            
            Promise.all([self.dashboard.generateDeviceCameraSnapshot(
                            self.dashboard,
                            self.pendingRequests[0].serial, 
                            body)])
                .then(function(results){
                    var settledItem = self.pendingRequests.shift();
                    console.log(results[0].data);
                    var fileTimestamp = settledItem.timestamp.replace(/:/g, "-");
                    var filename = settledItem.serial + "_" + fileTimestamp + ".jpg";
                    SnapshotDownloader.push(results[0].data.url, filename, SnapshotDownloader);
                })
                .catch(function(error){
                    if (("status" in error) && (error.status != null)) {
                        console.log("ERROR " + error.status);
                    }
                    if (("errors" in error) && (error.errors != null)) {
                        console.log(error.errors);                                          
                    }
                    if (self.pendingRequests.length > 0) {
                        // if catching error in original request and not in ".then" code
                        self.pendingRequests[0].retry++;
                        if (self.pendingRequests[0].retry >= self.maxRetries) {
                            var droppedItem = self.pendingRequests.shift();
                            console.log("SnapshotRequester: Max retries reached for item:");
                            console.log(droppedItem);
                        }
                    }
                })
                .finally(function() {                    
                    self.requestProcessingTimeout = setTimeout(function() {
                        self.processNextRequest(self);
                    }, self.processingInterval);
                });
            
        }
        else {
            console.log("SnapshotRequester: Queue empty");
            self.requestProcessingTimeout = null;
        }
    }
}

var SnapshotRequester = new SnapshotRequesterClass();

module.exports = SnapshotRequester;
module.exports.SnapshotRequesterClass = SnapshotRequesterClass;