var     FILES_TO_FETCH = [];
var     IMAGE_LOAD_TIMEOUT_OBJ = null;
const   IMAGE_LOAD_TIMEOUT_DELAY_MSEC = 1000;

function fetchEvents() {
    return new Promise( function(resolve, reject) {
        var resource = location.protocol + "//" + location.host + "/api/events";
        
        fetch(resource)
            .then()
            .then(res => res.json())
            .then((output) => {
                resolve(output);
            })
            .catch(err => { console.log("ERROR GET " + resource) 
                reject('error');
            });        
    });    
}

function fetchImage(fileName, targetDivId) {
    var resource = location.protocol + "//" + location.host + "/api/image?filename=" + fileName;
    
    fetch(resource)
        .then()
        .then(res => res.json())
        .then((output) => {
            var snapshot = new Image();
            snapshot.src = 'data:image/jpg;base64,' + output.imageBase64;
            snapshot.width = "300";
            var targetDiv = document.getElementById(targetDivId);
            targetDiv.appendChild(snapshot);
        })
        .catch(err => { console.log("ERROR GET " + resource) });      
}

function loadSnapshotImages() {
    FILES_TO_FETCH.forEach(function(item) {
        fetchImage(item, item);
    });
}

window.onload = function() {  
    Promise.all([fetchEvents()])
        .then(function(results){
            var containerDiv = document.getElementById('divBody');
            
            results[0].events.forEach(function(item) {
                console.log(item);
                FILES_TO_FETCH.push(item.imageFileName);
                var itemDiv     = document.createElement('div');
                var table       = document.createElement('table');
                var tr          = document.createElement('tr');
                var tdText      = document.createElement('td');
                var tdImage     = document.createElement('td');
                var p           = document.createElement('p');
                var br1         = document.createElement('br');
                var br2         = document.createElement('br');
                var br3         = document.createElement('br');
                var br4         = document.createElement('br');
                var txtNetName  = document.createTextNode(item.networkName);
                var txtCamName  = document.createTextNode(item.cameraName);
                var txtSerial   = document.createTextNode(item.cameraSerial);
                var txtTime     = document.createTextNode(item.dateTimeIso.substring(11, 19) + " UTC");
                var txtDate     = document.createTextNode(item.dateTimeIso.substring( 0, 10));
                
                tdImage.id = item.imageFileName;
                
                p.appendChild(txtNetName);
                p.appendChild(br1);
                p.appendChild(txtCamName);
                p.appendChild(br2);
                p.appendChild(txtSerial);
                p.appendChild(br3);
                p.appendChild(txtDate);
                p.appendChild(br4);
                p.appendChild(txtTime);
                tdText.appendChild(p);
                tr.appendChild(tdText);
                tr.appendChild(tdImage);
                table.appendChild(tr);
                itemDiv.appendChild(table);
                containerDiv.appendChild(itemDiv);  

                if (IMAGE_LOAD_TIMEOUT_OBJ == null) {
                    IMAGE_LOAD_TIMEOUT_OBJ = setTimeout(function(){
                        loadSnapshotImages();
                        IMAGE_LOAD_TIMEOUT_OBJ = null;
                    }, IMAGE_LOAD_TIMEOUT_DELAY_MSEC);
                }
            });
            
        })
}