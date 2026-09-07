"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
class Counter extends react_1.default.Component {
    constructor(props) {
        super(props);
        this.increment = () => {
            this.setState({ count: this.state.count + this.props.step });
        };
        this.state = { count: 0 };
    }
    componentDidMount() {
        console.log("Counter mounted");
    }
    render() {
        return (react_1.default.createElement("div", null,
            react_1.default.createElement("p", null,
                "Count: ",
                this.state.count),
            react_1.default.createElement("button", { onClick: this.increment }, "Add")));
    }
}
exports.default = Counter;
