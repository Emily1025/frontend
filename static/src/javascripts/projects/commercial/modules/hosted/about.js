import Promise from 'Promise';
import bean from 'bean';
import $ from 'common/utils/$';
import SurveySimple from 'commercial/modules/survey/survey-simple';

function init() {

    return new Promise(function(resolve) {

        var survey = new SurveySimple({
            id: 'hosted-about',
            header: 'Advertiser content',
            paragraph1: 'Advertiser content is used to describe advertisement features that are paid for, produced and controlled by the advertiser rather than the publisher​.',
            paragraph2: 'They​ are subject to regulation by the Advertising Standards Authority in the UK, the Federal Trade Commission in the US and the Advertising Standards Bureau in Australia.',
            paragraph3: 'This content is produced by the advertiser and does not involve Guardian News and Media staff.',
            showCloseBtn: true
        });

        survey.attach();

        bean.on(document, 'click', $('.js-hosted-about'), function(e) {
            e.preventDefault();
            $('.js-survey-overlay').removeClass('u-h');
        });

        resolve();
    });
}

export default {
    init: init
};
