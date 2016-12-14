/*
 Module: audience.js
 Description: Displays information about how the test users are divided.
 */
import Component from 'common/modules/component';
import AudienceItem from 'admin/modules/abtests/audience-item';
import assign from 'lodash/objects/assign';
import clone from 'lodash/objects/clone';

function Audience(config) {
    this.config = assign(clone(this.config), config);
}

Component.define(Audience);

Audience.prototype.config = {
    tests: [],
};

Audience.prototype.templateName = 'audience-template';
Audience.prototype.componentClass = 'audience-breakdown';
Audience.prototype.useBem = true;

Audience.prototype.prerender = function () {
    const testsContainer = this.getElem('tests');

    this.config.tests.forEach((test) => {
        /* eslint-disable new-cap*/
        new AudienceItem({
            test,
        }).render(testsContainer);
        /* eslint-enable new-cap*/
    });
};

Audience.prototype.ready = () => {

};

export default Audience;
