import fastdom from 'fastdom';
import throttle from 'lodash/functions/throttle';
import config from 'common/utils/config';
import detect from 'common/utils/detect';
import userTiming from 'common/utils/user-timing';
import dfpEnv from 'commercial/modules/dfp/dfp-env';
import loadAdvert from 'commercial/modules/dfp/load-advert';
import performanceLogging from 'commercial/modules/dfp/performance-logging';
import getAdvertById from 'commercial/modules/dfp/get-advert-by-id';
/* nbOfFrames: integer. Number of refresh frames we want to throttle the scroll handler */
var nbOfFrames = 6;

/* durationOfFrame: integer. Number of miliseconds a refresh frame typically lasts */
var durationOfFrame = 16;

/* depthOfScreen: double. Top and bottom margin of the visual viewport to check for the presence of an advert */
var depthOfScreen = 1.5;

/* loadQueued: boolean. Set to true when a lazyload task is scheduled */
var loadQueued = false;

var lazyLoad = throttle(function() {
    var viewportHeight = detect.getViewport().height;

    if (loadQueued) {
        return;
    }

    loadQueued = true;
    fastdom.read(function() {
        loadQueued = false;
        var lazyLoad = dfpEnv.advertsToLoad
            .filter(function(advert) {
                var rect = advert.node.getBoundingClientRect();
                var isNotHidden = rect.top + rect.left + rect.right + rect.bottom !== 0;
                var isNotTooFarFromTop = (1 - depthOfScreen) * viewportHeight < rect.bottom;
                var isNotTooFarFromBottom = rect.top < viewportHeight * depthOfScreen;
                // load the ad only if it's setting within an acceptable range
                return isNotHidden && isNotTooFarFromTop && isNotTooFarFromBottom;
            })
            .map(function(advert) {
                return advert.id;
            });

        dfpEnv.advertsToLoad = dfpEnv.advertsToLoad.filter(function(advert) {
            return lazyLoad.indexOf(advert.id) < 0;
        });

        if (dfpEnv.advertsToLoad.length === 0) {
            disableLazyLoad();
        }

        lazyLoad.forEach(function(advertId) {
            var advert = getAdvertById(advertId);
            performanceLogging.updateAdvertMetric(advert, 'lazyWaitComplete', userTiming.getCurrentTime());
            loadAdvert(advert);
        });
    });
}, nbOfFrames * durationOfFrame);

function disableLazyLoad() {
    dfpEnv.lazyLoadEnabled = false;
    window.removeEventListener('scroll', lazyLoad);
}

export default lazyLoad;
