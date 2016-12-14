import config from 'common/utils/config';

const remarketingUrl = '//www.googleadservices.com/pagead/conversion_async.js';

function onLoad() {
    window.google_trackConversion({
        google_conversion_id: 971225648,
        google_custom_params: window.google_tag_params,
        google_remarketing_only: true,
    });
}

export default {
    shouldRun: config.switches.remarketing,
    url: remarketingUrl,
    onLoad,
};
