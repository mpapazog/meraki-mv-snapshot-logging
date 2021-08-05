// SnapshotDownloader.js

const Axios     = require('axios');
const Fs        = require('fs')  
const Path      = require('path') 

const Config    = require('./Config');

class SnapshotDownloaderClass {
    constructor() {
        this.pendingRequests = [];
        this.requestProcessingTimeout = null;
        this.processingInterval = Config.fileDownloader.snapshotDownloadRetryIntervalSeconds * 1000;
        this.maxRetries = Config.fileDownloader.maxFileDownloadRetries;
        
    }
    
    push(url, filename, self) {
        var item = {
            url: url,
            filename: filename,
            retry: 0
        };
        self.pendingRequests.push(item);
        if (self.requestProcessingTimeout == null) {
            self.requestProcessingTimeout = setTimeout(function() {
                self.processNextRequest(self);
            }, self.processingInterval);
        }
    }
    
    async downloadImage (url, filename) {  
        
        try {
            var path = Path.resolve(__dirname, Config.fileDownloader.imagesFolderPath, filename); 
            console.log("Saving file: " + path);
            var writer = Fs.createWriteStream(path);
        }
        catch(error) {
            console.log(error);
            return Promise.reject();
        }

        var response = await Axios({
            url,
            method: 'GET',
            responseType: 'stream'
            });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve)
            writer.on('error', reject)
            });
    }
    
    processNextRequest(self) {
        if (self.pendingRequests.length > 0) {
            console.log("SnapshotDownloader: Downloading queue item 1/" + String(self.pendingRequests.length) + ":");
            console.log(self.pendingRequests[0]);
            
            self.downloadImage(self.pendingRequests[0].url, self.pendingRequests[0].filename)
                .then(function(response) {
                    var settledItem = self.pendingRequests.shift();
                })
                .catch(function(error) {
                    if (self.pendingRequests.length > 0) {
                        // if catching error in original request and not in ".then" code
                        self.pendingRequests[0].retry++;
                        if (self.pendingRequests[0].retry >= self.maxRetries) {
                            var droppedItem = self.pendingRequests.shift();
                            console.log("SnapshotDownloader: Max retries reached for item:");
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
            console.log("SnapshotDownloader: Queue empty");
            self.requestProcessingTimeout = null;
        }
    }
}

var SnapshotDownloader = new SnapshotDownloaderClass();

module.exports = SnapshotDownloader;
module.exports.SnapshotDownloaderClass = SnapshotDownloaderClass;