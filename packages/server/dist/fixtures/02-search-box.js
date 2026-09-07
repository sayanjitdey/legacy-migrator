"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
class SearchBox extends react_1.default.Component {
    constructor(props) {
        super(props);
        this.debounceTimer = null;
        this.runSearch = async (query) => {
            this.setState({ loading: true });
            const results = query ? [`${query}-result-1`, `${query}-result-2`] : [];
            this.setState({ results, loading: false });
            this.props.onResultsChange(results);
        };
        this.state = { results: [], loading: false };
    }
    componentDidMount() {
        this.runSearch(this.props.query);
    }
    componentDidUpdate(prevProps) {
        if (prevProps.query !== this.props.query) {
            if (this.debounceTimer)
                clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.runSearch(this.props.query);
            }, 300);
        }
    }
    componentWillUnmount() {
        if (this.debounceTimer)
            clearTimeout(this.debounceTimer);
    }
    render() {
        return (react_1.default.createElement("div", null,
            this.state.loading ? react_1.default.createElement("span", null, "Loading...") : null,
            react_1.default.createElement("ul", null, this.state.results.map((r) => (react_1.default.createElement("li", { key: r }, r))))));
    }
}
exports.default = SearchBox;
