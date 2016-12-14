import bean from 'bean';
import debounce from 'lodash/functions/debounce';
import bonzo from 'bonzo';
import fastdom from 'fastdom';
import $ from 'common/utils/$';
import qwery from 'qwery';
import config from 'common/utils/config';
import url from 'common/utils/url';
import detect from 'common/utils/detect';
import FiniteStateMachine from 'common/utils/fsm';
import mediator from 'common/utils/mediator';
import map from 'lodash/collections/map';
import throttle from 'lodash/functions/throttle';
import forEach from 'lodash/collections/forEach';
import interactionTracking from 'common/modules/analytics/interaction-tracking';
import chain from 'common/utils/chain';
import loadCssPromise from 'common/utils/load-css-promise';


function HostedGallery() {
    // CONFIG
    const breakpoint = detect.getBreakpoint();
    this.useSwipe = detect.hasTouchScreen() && (breakpoint === 'mobile' || breakpoint === 'tablet');
    this.swipeThreshold = 0.05;
    this.index = this.index || 1;
    this.imageRatios = [];

    // ELEMENT BINDINGS
    this.$galleryEl = $('.js-hosted-gallery-container');
    this.$galleryFrame = $('.js-hosted-gallery-frame');
    this.$header = $('.js-hosted-headerwrap');
    this.$imagesContainer = $('.js-hosted-gallery-images', this.$galleryEl);
    this.$captionContainer = $('.js-gallery-caption-bar');
    this.$captions = $('.js-hosted-gallery-caption', this.$captionContainer);
    this.$scrollEl = $('.js-hosted-gallery-scroll-container', this.$galleryEl);
    this.$images = $('.js-hosted-gallery-image', this.$imagesContainer);
    this.$progress = $('.js-hosted-gallery-progress', this.$galleryEl);
    this.$border = $('.js-hosted-gallery-rotating-border', this.$progress);
    this.prevBtn = qwery('.inline-arrow-up', this.$progress)[0];
    this.nextBtn = qwery('.inline-arrow-down', this.$progress)[0];
    this.infoBtn = qwery('.js-gallery-caption-button', this.$captionContainer)[0];
    this.$counter = $('.js-hosted-gallery-image-count', this.$progress);
    this.$ctaFloat = $('.js-hosted-gallery-cta', this.$galleryEl)[0];
    this.$ojFloat = $('.js-hosted-gallery-oj', this.$galleryEl)[0];
    this.$meta = $('.js-hosted-gallery-meta', this.$galleryEl)[0];
    this.ojClose = qwery('.js-hosted-gallery-oj-close', this.$ojFloat)[0];

    if (this.$galleryEl.length) {
        this.resize = this.trigger.bind(this, 'resize');
        mediator.on('window:resize', this.resize);

        // FSM CONFIG
        this.fsm = new FiniteStateMachine({
            initial: 'image',
            onChangeState() {},
            context: this,
            states: this.states,
        });

        bean.on(this.infoBtn, 'click', this.trigger.bind(this, 'toggle-info'));
        bean.on(this.ojClose, 'click', this.toggleOj.bind(this));
        bean.on(document.body, 'keydown', this.handleKeyEvents.bind(this));
        this.loadSurroundingImages(1, this.$images.length);
        this.setPageWidth();

        if (this.useSwipe) {
            this.$galleryEl.addClass('use-swipe');
            this.initSwipe();
        } else {
            this.$galleryEl.addClass('use-scroll');
            this.initScroll();
        }
    }
}

HostedGallery.prototype.toggleOj = function () {
    bonzo(this.$ojFloat).toggleClass('minimise-oj');
};

HostedGallery.prototype.initScroll = function () {
    bean.on(this.nextBtn, 'click', () => {
        this.scrollTo(this.index + 1);
        this.trigger.bind(this, 'next', {
            nav: 'Click',
        });
    });
    bean.on(this.prevBtn, 'click', () => {
        this.scrollTo(this.index - 1);
        this.trigger.bind(this, 'prev', {
            nav: 'Click',
        });
    });

    bean.on(this.$scrollEl[0], 'scroll', throttle(this.fadeContent.bind(this), 20));
};

HostedGallery.prototype.initSwipe = function () {
    let threshold; // time in ms
    let ox;
    let dx;
    let touchMove;
    const updateTime = 20;
    this.$imagesContainer.css('width', `${this.$images.length}00%`);

    bean.on(this.$galleryEl[0], 'touchstart', (e) => {
        threshold = this.swipeContainerWidth * this.swipeThreshold;
        ox = e.touches[0].pageX;
        dx = 0;
    });

    touchMove = (e) => {
        e.preventDefault();
        if (e.touches.length > 1 || e.scale && e.scale !== 1) {
            return;
        }
        dx = e.touches[0].pageX - ox;
        this.translateContent(this.index, dx, updateTime);
    };

    bean.on(this.$galleryEl[0], 'touchmove', throttle(touchMove, updateTime, {
        trailing: false,
    }));

    bean.on(this.$galleryEl[0], 'touchend', () => {
        let direction;
        if (Math.abs(dx) > threshold) {
            direction = dx > threshold ? 1 : -1;
        } else {
            direction = 0;
        }
        dx = 0;

        if (direction === 1) {
            if (this.index > 1) {
                this.trigger('prev', {
                    nav: 'Swipe',
                });
            } else {
                this.trigger('reload');
            }
        } else if (direction === -1) {
            if (this.index < this.$images.length) {
                this.trigger('next', {
                    nav: 'Swipe',
                });
            } else {
                this.trigger('reload');
            }
        } else {
            this.trigger('reload');
        }
    });
};

HostedGallery.prototype.ctaIndex = () => {
    const ctaIndex = config.page.ctaIndex;
    const images = config.page.images;
    return (ctaIndex > 0 && ctaIndex < images.length - 1) ? ctaIndex : undefined;
};

HostedGallery.prototype.trigger = function (event, data) {
    this.fsm.trigger(event, data);
};

HostedGallery.prototype.loadSurroundingImages = function (index, count) {
    let $img;
    const that = this;
    chain([0, 1, 2]).and(
        map,
        i => index + i === 0 ? count - 1 : (index - 1 + i) % count
    ).and(forEach, (i) => {
        $img = $('img', this.$images[i]);
        if (!$img[0].complete) {
            bean.one($img[0], 'load', setSize.bind(this, $img, i));
        } else {
            setSize($img, i);
        }
    });

    function setSize($image, index) {
        if (!that.imageRatios[index]) {
            that.imageRatios[index] = $image[0].naturalWidth / $image[0].naturalHeight;
        }
        that.resizeImage.call(that, index);
    }
};

HostedGallery.prototype.resizeImage = function (imgIndex) {
    const $imageDiv = this.$images[imgIndex];
    const $galleryFrame = this.$galleryFrame[0];
    const $ctaFloat = this.$ctaFloat;
    const $ojFloat = this.$ojFloat;
    const $meta = this.$meta;
    const $images = this.$images;
    const width = $galleryFrame.clientWidth;
    const height = $galleryFrame.clientHeight;
    const $sizer = $('.js-hosted-gallery-image-sizer', $imageDiv);
    const imgRatio = this.imageRatios[imgIndex];
    const ctaSize = getFrame(0);
    const ctaIndex = this.ctaIndex();
    const tabletSize = 740;
    const imageSize = getFrame(imgRatio);
    fastdom.write(() => {
        $sizer.css('width', imageSize.width);
        $sizer.css('height', imageSize.height);
        $sizer.css('top', imageSize.topBottom);
        $sizer.css('left', imageSize.leftRight);
        if (imgIndex === ctaIndex) {
            bonzo($ctaFloat).css('bottom', ctaSize.topBottom);
        }
        if (imgIndex === $images.length - 1) {
            bonzo($ojFloat).css('bottom', ctaSize.topBottom);
        }
        if (imgIndex === $images.length - 1) {
            bonzo($ojFloat).css('padding-bottom', (ctaSize.topBottom > 40 || width > tabletSize) ? 0 : 40);
        }
        if (imgIndex === 0) {
            bonzo($meta).css('padding-bottom', (imageSize.topBottom > 40 || width > tabletSize) ? 20 : 40);
        }
    });

    function getFrame(desiredRatio, w, h) {
        w = w || width;
        h = h || height;
        const frame = {
            height: h,
            width: w,
            topBottom: 0,
            leftRight: 0,
        };
        if (!desiredRatio) return frame;
        if (desiredRatio > w / h) {
            // portrait screens
            frame.height = w / desiredRatio;
            frame.topBottom = (h - frame.height) / 2;
        } else {
            // landscape screens
            frame.width = h * desiredRatio;
            frame.leftRight = (w - frame.width) / 2;
        }
        return frame;
    }
};

HostedGallery.prototype.translateContent = function (imgIndex, offset, duration) {
    const px = -1 * (imgIndex - 1) * this.swipeContainerWidth;
    const galleryEl = this.$imagesContainer[0];
    const $meta = this.$meta;
    galleryEl.style.webkitTransitionDuration = `${duration}ms`;
    galleryEl.style.mozTransitionDuration = `${duration}ms`;
    galleryEl.style.msTransitionDuration = `${duration}ms`;
    galleryEl.style.transitionDuration = `${duration}ms`;
    galleryEl.style.webkitTransform = `translate(${px + offset}px,0)` + 'translateZ(0)';
    galleryEl.style.mozTransform = `translate(${px + offset}px,0)`;
    galleryEl.style.msTransform = `translate(${px + offset}px,0)`;
    galleryEl.style.transform = `translate(${px + offset}px,0)` + 'translateZ(0)';
    fastdom.write(() => {
        bonzo($meta).css('opacity', offset != 0 ? 0 : 1);
    });
};

HostedGallery.prototype.fadeContent = function (e) {
    const length = this.$images.length;
    const scrollTop = e.target.scrollTop;
    const scrollHeight = e.target.scrollHeight;
    const progress = Math.round(length * (scrollTop / scrollHeight) * 100) / 100;
    const fractionProgress = progress % 1;
    const deg = Math.ceil(fractionProgress * 360);
    const newIndex = Math.round(progress + 0.75);
    const ctaIndex = this.ctaIndex();
    fastdom.write(() => {
        this.$images.each((image, index) => {
            const opacity = ((progress - index + 1) * 16 / 11) - 0.0625;
            bonzo(image).css('opacity', Math.min(Math.max(opacity, 0), 1));
        });

        bonzo(this.$border).css('transform', `rotate(${deg}deg)`);
        bonzo(this.$border).css('-webkit-transform', `rotate(${deg}deg)`);

        bonzo(this.$galleryEl).toggleClass('show-cta', progress <= ctaIndex && progress >= ctaIndex - 0.25);
        bonzo(this.$galleryEl).toggleClass('show-oj', progress >= length - 1.25);

        bonzo(this.$progress).toggleClass('first-half', fractionProgress && fractionProgress < 0.5);

        bonzo(this.$meta).css('opacity', progress != 0 ? 0 : 1);
    });

    if (newIndex && newIndex !== this.index) {
        this.index = newIndex;
        this.trigger('reload', {
            nav: 'Scroll',
        });
    }
};

HostedGallery.prototype.scrollTo = function (index) {
    const scrollEl = this.$scrollEl;
    const length = this.$images.length;
    const scrollHeight = scrollEl[0].scrollHeight;
    fastdom.write(() => {
        scrollEl.scrollTop((index - 1) * scrollHeight / length);
    });
};


HostedGallery.prototype.states = {
    image: {
        enter() {
            const that = this;

            // load prev/current/next
            this.loadSurroundingImages(this.index, this.$images.length);
            this.$captions.each((caption, index) => {
                bonzo(caption).toggleClass('current-caption', that.index === index + 1);
            });
            bonzo(this.$counter).html(`${this.index}/${this.$images.length}`);

            if (this.useSwipe) {
                this.translateContent(this.index, 0, 100);
                bonzo(this.$galleryEl).toggleClass('show-oj', this.index === this.$images.length);
                bonzo(this.$galleryEl).toggleClass('show-cta', this.index === this.ctaIndex() + 1);
            }

            const pageName = config.page.pageName || window.location.pathname.substr(window.location.pathname.lastIndexOf('/') + 1);
            url.pushUrl({}, document.title, `${pageName}#img-${this.index}`, true);
            // event bindings
            mediator.on('window:resize', this.resize);
        },
        leave() {
            this.trigger('hide-info');
            mediator.off('window:resize', this.resize);
        },
        events: {
            next(e) {
                if (this.index < this.$images.length) { // last img
                    this.index += 1;
                    this.trackNavBetweenImages(e);
                }
                this.reloadState = true;
            },
            prev(e) {
                if (this.index > 1) { // first img
                    this.index -= 1;
                    this.trackNavBetweenImages(e);
                }
                this.reloadState = true;
            },
            reload(e) {
                this.trackNavBetweenImages(e);
                this.reloadState = true;
            },
            'toggle-info': function () {
                this.$captionContainer.toggleClass('hosted-gallery--show-caption');
            },
            'hide-info': function () {
                this.$captionContainer.removeClass('hosted-gallery--show-caption');
            },
            'show-info': function () {
                this.$captionContainer.addClass('hosted-gallery--show-caption');
            },
            resize() {
                this.onResize();
            },
        },
    },
};

HostedGallery.prototype.trackNavBetweenImages = function (data) {
    if (data && data.nav) {
        interactionTracking.trackNonClickInteraction(`${config.page.trackingPrefix + data.nav} - image ${this.index}`);
    }
};

HostedGallery.prototype.onResize = function () {
    this.resizer = this.resizer || (() => {
        this.loadSurroundingImages(this.index, this.$images.length);
        if (this.useSwipe) {
            this.swipeContainerWidth = this.$galleryFrame.dim().width;
            this.translateContent(this.index, 0, 0);
        }
        this.setPageWidth();
    });
    throttle(this.resizer, 200)();
};

HostedGallery.prototype.setPageWidth = function () {
    const $imagesContainer = this.$imagesContainer[0];
    const $gallery = this.$galleryEl[0];
    const width = $gallery.clientWidth;
    const height = $imagesContainer.clientHeight;
    const $header = this.$header;
    const $footer = this.$captionContainer;
    const $galleryFrame = this.$galleryFrame;
    const imgRatio = 5 / 3;
    let imageWidth = width;
    let leftRight = 0;
    const that = this;
    if (imgRatio < width / height) {
        imageWidth = height * imgRatio;
        leftRight = `${(width - imageWidth) / 2}px`;
    }
    this.swipeContainerWidth = imageWidth;
    fastdom.write(() => {
        $header.css('width', imageWidth);
        $footer.css('margin', `0 ${leftRight}`);
        $footer.css('width', 'auto');
        $galleryFrame.css('left', leftRight);
        $galleryFrame.css('right', leftRight);
        that.loadSurroundingImages(that.index, that.$images.length);
    });
};

HostedGallery.prototype.handleKeyEvents = function (e) {
    const keyNames = {
        37: 'left',
        38: 'up',
        39: 'right',
        40: 'down',
    };
    if (e.keyCode === 37 || e.keyCode === 38) { // up/left
        e.preventDefault();
        this.scrollTo(this.index - 1);
        this.trigger('prev', {
            nav: `KeyPress:${keyNames[e.keyCode]}`,
        });
        return false;
    } else if (e.keyCode === 39 || e.keyCode === 40) { // down/right
        e.preventDefault();
        this.scrollTo(this.index + 1);
        this.trigger('next', {
            nav: `KeyPress:${keyNames[e.keyCode]}`,
        });
        return false;
    } else if (e.keyCode === 73) { // 'i'
        this.trigger('toggle-info');
    }
};

HostedGallery.prototype.loadAtIndex = function (i) {
    this.index = i;
    this.trigger('reload');
    if (this.useSwipe) {
        this.translateContent(this.index, 0, 0);
    } else {
        this.scrollTo(this.index);
    }
};

function init() {
    return loadCssPromise.then(() => {
        let gallery;
        let match;
        const galleryHash = window.location.hash;
        let res;

        gallery = new HostedGallery();
        match = /\?index=(\d+)/.exec(document.location.href);
        if (match) { // index specified so launch gallery at that index
            gallery.loadAtIndex(parseInt(match[1], 10));
        } else {
            res = /^#(?:img-)?(\d+)$/.exec(galleryHash);
            if (res) {
                gallery.loadAtIndex(parseInt(res[1], 10));
            }
        }
    });
}

export default {
    init,
    HostedGallery,
};
