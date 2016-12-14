import bean from 'bean';
import bonzo from 'bonzo';
import fastdom from 'fastdom';
import fastdomPromise from 'common/utils/fastdom-promise';
import raven from 'common/utils/raven';
import Promise from 'Promise';
import $ from 'common/utils/$';
import config from 'common/utils/config';
import deferToAnalytics from 'common/utils/defer-to-analytics';
import detect from 'common/utils/detect';
import mediator from 'common/utils/mediator';
import beacon from 'common/modules/analytics/beacon';
import videoAdUrl from 'common/modules/commercial/video-ad-url';
import commercialFeatures from 'common/modules/commercial/commercial-features';
import Component from 'common/modules/component';
import ab from 'common/modules/experiments/ab';
import events from 'common/modules/video/events';
import videoMetadata from 'common/modules/video/metadata';
import fullscreener from 'common/modules/media/videojs-plugins/fullscreener';
import skipAd from 'common/modules/media/videojs-plugins/skip-ad';
import videoContainer from 'common/modules/video/video-container';
import onwardContainer from 'common/modules/video/onward-container';
import moreInSeriesContainer from 'common/modules/video/more-in-series-container';
import videojsOptions from 'common/modules/video/videojs-options';
import videojs from 'bootstraps/enhanced/media/video-player';
import loadingTmpl from 'text!common/views/ui/loading.html';

function initLoadingSpinner(player) {
    player.loadingSpinner.contentEl().innerHTML = loadingTmpl;
}

function upgradeVideoPlayerAccessibility(player) {
    // Set the video tech element to aria-hidden, and label the buttons in the videojs control bar.
    $('.vjs-tech', player.el()).attr('aria-hidden', true);

    // Hide superfluous controls, and label useful buttons.
    $('.vjs-big-play-button', player.el()).attr('aria-hidden', true);
    $('.vjs-current-time', player.el()).attr('aria-hidden', true);
    $('.vjs-time-divider', player.el()).attr('aria-hidden', true);
    $('.vjs-duration', player.el()).attr('aria-hidden', true);
    $('.vjs-embed-button', player.el()).attr('aria-hidden', true);

    $('.vjs-play-control', player.el()).attr('aria-label', 'video play');
    $('.vjs-mute-control', player.el()).attr('aria-label', 'video mute');
    $('.vjs-fullscreen-control', player.el()).attr('aria-label', 'video fullscreen');
}

function createVideoPlayer(el, options) {
    const player = videojs(el, options);

    const duration = parseInt(el.getAttribute('data-duration'), 10);

    player.ready(() => {
        if (!isNaN(duration)) {
            player.duration(duration);
            player.trigger('timeupdate'); // triggers a refresh of relevant control bar components
        }
        // we have some special autoplay rules, so do not want to depend on 'default' autoplay
        player.guAutoplay = $(el).attr('data-auto-play') === 'true';

        // need to explicitly set the dimensions for the ima plugin.
        player.height(bonzo(player.el()).parent().dim().height);
        player.width(bonzo(player.el()).parent().dim().width);
    });

    return player;
}

function initPlayButtons(root) {
    fastdom.read(() => {
        $('.js-video-play-button', root).each((el) => {
            const $el = bonzo(el);
            bean.on(el, 'click', () => {
                let placeholder;
                let player;
                let container;
                container = bonzo(el).parent().parent();
                placeholder = $('.js-video-placeholder', container);
                player = $('.js-video-player', container);
                fastdom.write(() => {
                    placeholder.removeClass('media__placeholder--active').addClass('media__placeholder--hidden');
                    player.removeClass('media__container--hidden').addClass('media__container--active');
                    $el.removeClass('media__placeholder--active').addClass('media__placeholder--hidden');
                    enhanceVideo($('video', player).get(0), true);
                });
            });
            fastdom.write(() => {
                $el.removeClass('media__placeholder--hidden').addClass('media__placeholder--active');
            });
        });
    });
}

function initPlayer(withPreroll) {
    videojs.plugin('skipAd', skipAd);
    videojs.plugin('fullscreener', fullscreener);

    fastdom.read(() => {
        $('.js-gu-media--enhance').each((el) => {
            enhanceVideo(el, false, withPreroll);
        });
    });
}

function initExploreVideo() {
    let player = $('.vjs-tech');
    let headline = $('.explore-series-headline')[0];
    let controls = $('.vjs-control-bar');
    if (player && headline && controls) {
        bean.on(player[0], 'playing', () => {
            bonzo(headline).addClass('playing');
            bonzo(controls[0]).addClass('playing');
        });
        bean.on(player[0], 'pause', () => {
            bonzo(headline).removeClass('playing');
            bonzo(controls[0]).removeClass('playing');
        });
    }
}

function enhanceVideo(el, autoplay, shouldPreroll) {
    let mediaType = el.tagName.toLowerCase();
    let $el = bonzo(el).addClass('vjs');
    let mediaId = $el.attr('data-media-id');
    let endSlateUri = $el.attr('data-end-slate');
    let embedPath = $el.attr('data-embed-path');

    let // we need to look up the embedPath for main media videos
    canonicalUrl = $el.attr('data-canonical-url') || (embedPath ? embedPath : null);

    let // the fallback to window.location.pathname should only happen for main media on fronts
    gaEventLabel = canonicalUrl || window.location.pathname;

    let player;
    let mouseMoveIdle;
    let playerSetupComplete;
    let withPreroll;
    let blockVideoAds;

    // end-slate url follows the patten /video/end-slate/section/<section>.json?shortUrl=
    // only show end-slate if page has a section i.e. not on the `/global` path
    // e.g https://www.theguardian.com/global/video/2016/nov/01/what-happened-at-the-battle-of-orgreave-video-explainer
    const showEndSlate = $el.attr('data-show-end-slate') === 'true' && !!config.page.section;

    player = createVideoPlayer(el, videojsOptions({
        plugins: {
            embed: {
                embeddable: !config.page.isFront && config.switches.externalVideoEmbeds && (config.page.contentType === 'Video' || $el.attr('data-embeddable') === 'true'),
                location: `${config.page.externalEmbedHost}/embed/video/${embedPath ? embedPath : config.page.pageId}`,
            },
        },
    }));
    events.addContentEvents(player, mediaId, mediaType);
    events.addPrerollEvents(player, mediaId, mediaType);
    events.bindGoogleAnalyticsEvents(player, gaEventLabel);

    videoMetadata.getVideoInfo($el).then((videoInfo) => {
        if (videoInfo.expired) {
            player.ready(() => {
                player.error({
                    code: 0,
                    type: 'Video Expired',
                    message: 'This video has been removed. This could be because it launched early, ' +
                        'our rights have expired, there was a legal issue, or for another reason.',
                });
                player.bigPlayButton.dispose();
                player.errorDisplay.open();
                player.controlBar.dispose();
            });
        } else {
            videoMetadata.isGeoBlocked(el).then((isVideoGeoBlocked) => {
                if (isVideoGeoBlocked) {
                    player.ready(() => {
                        player.error({
                            code: 0,
                            type: 'Video Unavailable',
                            message: 'Sorry, this video is not available in your region due to rights restrictions.',
                        });
                        player.bigPlayButton.dispose();
                        player.errorDisplay.open();
                        player.controlBar.dispose();
                    });
                } else {
                    blockVideoAds = videoInfo.shouldHideAdverts;
                    withPreroll = shouldPreroll && !blockVideoAds;

                    // Location of this is important.
                    events.bindErrorHandler(player);
                    player.guMediaType = mediaType;

                    playerSetupComplete = new Promise((resolve) => {
                        player.ready(() => {
                            let vol;

                            deferToAnalytics(() => {
                                events.initOphanTracking(player, mediaId);
                                events.bindGlobalEvents(player);
                                events.bindContentEvents(player);
                                if (withPreroll) {
                                    events.bindPrerollEvents(player);
                                }
                            });

                            initLoadingSpinner(player);
                            upgradeVideoPlayerAccessibility(player);

                            player.one('playing', () => {
                                beacon.counts('video-tech-html5');
                            });

                            // unglitching the volume on first load
                            vol = player.volume();
                            if (vol) {
                                player.volume(0);
                                player.volume(vol);
                            }

                            player.persistvolume({
                                namespace: 'gu.vjs',
                            });

                            // preroll for videos only
                            if (mediaType === 'video') {
                                player.fullscreener();

                                if (showEndSlate && detect.isBreakpoint({
                                    min: 'desktop',
                                })) {
                                    initEndSlate(player, endSlateUri);
                                }

                                if (withPreroll) {
                                    raven.wrap({
                                        tags: {
                                            feature: 'media',
                                        },
                                    }, () => {
                                        player.ima({
                                            id: mediaId,
                                            adTagUrl: videoAdUrl.get(),
                                            prerollTimeout: 1000,
                                            // We set this sightly higher so contrib-ads never timeouts before ima.
                                            contribAdsSettings: {
                                                timeout: 2000,
                                            },
                                        });
                                        player.on('adstart', () => {
                                            player.skipAd(mediaType, 15);
                                        });
                                        player.ima.requestAds();

                                        // Video analytics event.
                                        player.trigger(events.constructEventName('preroll:request', player));
                                        resolve();
                                    })();
                                } else {
                                    resolve();
                                }
                            } else {
                                player.playlist({
                                    mediaType: 'audio',
                                    continuous: false,
                                });
                                resolve();
                            }

                            // built in vjs-user-active is buggy so using custom implementation
                            player.on('mousemove', () => {
                                clearTimeout(mouseMoveIdle);
                                fastdom.write(() => {
                                    player.addClass('vjs-mousemoved');
                                });

                                mouseMoveIdle = setTimeout(() => {
                                    fastdom.write(() => {
                                        player.removeClass('vjs-mousemoved');
                                    });
                                }, 500);
                            });
                        });
                    });

                    playerSetupComplete.then(() => {
                        if (autoplay) {
                            player.play();
                        }
                    });
                }
            });
        }
    });
    if ($('.explore--video').length > 0) {
        initExploreVideo();
    }
    return player;
}

function initEndSlate(player, endSlatePath) {
    let endSlate = new Component();
    let endStateClass = 'vjs-has-ended';

    endSlate.endpoint = endSlatePath;

    player.one(events.constructEventName('content:play', player), () => {
        endSlate.fetch(player.el(), 'html');

        player.on('ended', () => {
            bonzo(player.el()).addClass(endStateClass);
        });
    });

    player.on('playing', () => {
        bonzo(player.el()).removeClass(endStateClass);
    });
}

function getMediaType() {
    return config.page.contentType.toLowerCase();
}

function initMoreInSection() {
    if (!config.isMedia || !config.page.showRelatedContent || !config.page.section) {
        return;
    }

    const el = $('.js-more-in-section')[0];
    moreInSeriesContainer.init(
        el, getMediaType(),
        config.page.section,
        config.page.shortUrl,
        config.page.seriesId
    );
}

function initOnwardContainer() {
    if (!config.isMedia) {
        return;
    }

    const mediaType = getMediaType();
    const els = $(mediaType === 'video' ? '.js-video-components-container' : '.js-media-popular');

    els.each((el) => {
        onwardContainer.init(el, mediaType);
    });
}

function initWithRaven(withPreroll) {
    raven.wrap({
        tags: {
            feature: 'media',
        },
    },
        () => {
            initPlayer(withPreroll);
        }
    )();
}

function initFacia() {
    if (config.page.isFront) {
        $('.js-video-playlist').each((el) => {
            videoContainer.init(el);
        });
    }
}

function init() {
    // The `hasMultipleVideosInPage` flag is temporary until the # will be fixed
    const shouldPreroll = commercialFeatures.videoPreRolls &&
        !config.page.hasMultipleVideosInPage &&
        !config.page.isAdvertisementFeature &&
        !config.page.sponsorshipType;

    if (config.switches.enhancedMediaPlayer) {
        if (shouldPreroll) {
            require(['js!//imasdk.googleapis.com/js/sdkloader/ima3.js']).then(() => {
                initWithRaven(true);
            }, (e) => {
                raven.captureException(e, {
                    tags: {
                        feature: 'media',
                        action: 'ads',
                        ignored: true,
                    },
                });
                initWithRaven();
            });
        } else {
            initWithRaven();
        }
    }

    // Setup play buttons
    initPlayButtons(document.body);
    mediator.on('modules:related:loaded', initPlayButtons);
    mediator.on('page:media:moreinloaded', initPlayButtons);

    initFacia();

    initMoreInSection();

    initOnwardContainer();
}

export default {
    init,
};
