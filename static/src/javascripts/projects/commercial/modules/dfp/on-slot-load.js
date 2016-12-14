import getAdvertById from 'commercial/modules/dfp/get-advert-by-id';
import postMessage from 'commercial/modules/messenger/post-message';
var host = location.protocol + '//' + location.host;
export default onLoad;

/* This is for native ads. We send two pieces of information:
   - the ID of the iframe into which this ad is embedded. This is currently
     the only way to link an incoming message to the iframe it is "coming from"
   - the HOST of the parent frame. Again, inside the embedded document there is
     no way to know if we are running the site in production, dev or local mode.
     But, this information is necessary in the window.postMessage call, and so
     we resort to sending it as a token of welcome :)
*/
function onLoad(event) {
    var advert = getAdvertById(event.slot.getSlotElementId());
    if (advert.size === 'fluid') {
        var iframe = advert.node.getElementsByTagName('iframe')[0];
        postMessage({
            id: iframe.id,
            host: host
        }, iframe.contentWindow);
    }
}
