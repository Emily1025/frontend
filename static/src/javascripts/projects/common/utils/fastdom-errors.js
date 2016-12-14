// Record errors within fastdom:
// https://github.com/wilsonpage/fastdom#exceptions

import fastdom from 'fastdom';
import reportError from 'common/utils/report-error';
fastdom.onError = function(error) {
    // Some environments don't support or don't always expose the console object
    if (window.console && window.console.warn) {
        window.console.warn('Caught FastDom error.', error.stack);
    }
    reportError(error, {
        feature: 'fastdom'
    }, false);
};
