import bean from 'bean';
import fastdom from 'common/utils/fastdom-promise';
import $ from 'common/utils/$';
import ElementInview from 'common/utils/element-inview';
import videojs from 'bootstraps/enhanced/media/video-player';
import assign from 'lodash/objects/assign';
import createStore from 'common/utils/create-store';

const reducers = {
    NEXT: function next(previousState) {
        const position = previousState.position >= previousState.length ? previousState.position : previousState.position + 1;
        return assign({}, previousState, getPositionState(position, previousState.length));
    },

    PREV: function prev(previousState) {
        const position = previousState.position <= 0 ? 0 : previousState.position - 1;
        return assign({}, previousState, getPositionState(position, previousState.length));
    },

    INIT: function init(previousState) {
        fastdom.read(() => {
            // Lazy load images on scroll for mobile
            $('.js-video-playlist-image', previousState.container).each((el) => {
                const elementInview = ElementInview(el, $('.js-video-playlist-inner', previousState.container).get(0), {
                    // This loads 1 image in the future
                    left: 410,
                });

                elementInview.on('firstview', (el) => {
                    fastdom.write(() => {
                        const dataSrc = el.getAttribute('data-src');
                        const src = el.getAttribute('src');

                        if (dataSrc && !src) {
                            fastdom.write(() => {
                                el.setAttribute('src', dataSrc);
                            });
                        }
                    });
                });
            });
        });
        return previousState;
    },
};

function fetchLazyImage(container, i) {
    $(`.js-video-playlist-image--${i}`, container).each((el) => {
        fastdom.read(() => {
            const dataSrc = el.getAttribute('data-src');
            const src = el.getAttribute('src');
            return dataSrc && !src ? dataSrc : null;
        }).then((src) => {
            if (src) {
                fastdom.write(() => {
                    el.setAttribute('src', src);
                });
            }
        });
    });
}

function update(state, container) {
    const translateWidth = -state.videoWidth * state.position;

    return fastdom.write(() => {
        container.querySelector('.video-playlist__item--active').classList.remove('video-playlist__item--active');
        container.querySelector(`.js-video-playlist-item-${state.position}`).classList.add('video-playlist__item--active');

        container.classList.remove('video-playlist--end', 'video-playlist--start');
        if (state.atEnd) {
            container.classList.add('video-playlist--end');
        } else if (state.atStart) {
            container.classList.add('video-playlist--start');
        }

        // fetch the next image (for desktop)
        fetchLazyImage(container, state.position + 1);

        // pause all players (we should potentially think about this site wide)
        $('.js-video-playlist .vjs').each((el) => {
            videojs($(el)[0]).pause();
        });

        container.querySelector(`.js-video-playlist-item-${state.position}`).classList.add('video-playlist__item--active');
        container.querySelector('.js-video-playlist-inner').setAttribute('style',
            `-webkit-transform: translate(${translateWidth}px);` +
            `transform: translate(${translateWidth}px);`
        );
    });
}

function getPositionState(position, length) {
    return {
        position,
        atStart: position === 0,
        atEnd: position >= length,
    };
}

function getInitialState(container) {
    return {
        position: 0,
        length: container.getAttribute('data-number-of-videos'),
        videoWidth: 700,
        container,
    };
}

function setupDispatches(dispatch, container) {
    bean.on(container, 'click', '.js-video-playlist-next', () => {
        dispatch({
            type: 'NEXT',
        });
    });

    bean.on(container, 'click', '.js-video-playlist-prev', () => {
        dispatch({
            type: 'PREV',
        });
    });
}

function reducer(previousState, action) {
    return reducers[action.type] ? reducers[action.type](previousState) : previousState;
}

export default {
    init(container) {
        const initialState = getInitialState(container);
        const store = createStore(reducer, initialState);

        setupDispatches(store.dispatch, container);
        store.subscribe(() => {
            update(store.getState(), container);
        });
    },
};
