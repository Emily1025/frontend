import React from 'react';
import classNames from 'classnames';
import assign from 'lodash/objects/assign';
const ConfirmButton = React.createClass({
    getInitialState() {
        this.timeout = this.props.timeout || 2000;
        return {
            confirming: false,
        };
    },

    confirm() {
        if (this.state.confirming) {
            this.setState({
                confirming: false,
            });
            this.props.onClick();
        } else {
            this.setState({
                confirming: true,
            });
            setTimeout(() => {
                this.setState({
                    confirming: false,
                });
            }, this.timeout);
        }
    },

    render() {
        const inner = this.state.confirming ?
            `Confirm ${this.props.text.toLowerCase()}` : this.props.text;

        const classes = {};
        const className = classNames((
            classes['crossword__controls__button--confirm'] = this.state.confirming,
            classes[this.props.className] = true,
            classes
        ));

        return React.createElement(
            'button',
            assign({}, this.props, {
                onClick: this.confirm,
                className,
            }, this),
            inner
        );
    },
});

export default ConfirmButton;
