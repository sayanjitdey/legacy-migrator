"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
class Modal extends react_1.default.Component {
    constructor(props) {
        super(props);
        this.dialogRef = react_1.default.createRef();
        // Exposed imperatively - parent components call modalRef.current.open()
        this.open = () => {
            this.setState({ isOpen: true });
            if (this.dialogRef.current) {
                this.dialogRef.current.focus();
            }
        };
        this.close = () => {
            this.setState({ isOpen: false });
        };
        this.state = { isOpen: false };
    }
    shouldComponentUpdate(nextProps, nextState) {
        return nextState.isOpen !== this.state.isOpen || nextProps.title !== this.props.title;
    }
    render() {
        if (!this.state.isOpen)
            return null;
        return (react_1.default.createElement("div", { ref: this.dialogRef, tabIndex: -1 },
            react_1.default.createElement("h2", null, this.props.title),
            react_1.default.createElement("button", { onClick: this.close }, "Close")));
    }
}
// HOC wrapping - migration needs to account for this
function withLogging(Component) {
    return class extends react_1.default.Component {
        componentDidMount() {
            console.log("Wrapped component mounted");
        }
        render() {
            return react_1.default.createElement(Component, { ...this.props });
        }
    };
}
exports.default = withLogging(Modal);
