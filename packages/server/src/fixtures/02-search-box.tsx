import React from "react";

interface SearchBoxProps {
  onResultsChange: (results: string[]) => void;
  query: string;
}

interface SearchBoxState {
  results: string[];
  loading: boolean;
}

class SearchBox extends React.Component<SearchBoxProps, SearchBoxState> {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: SearchBoxProps) {
    super(props);
    this.state = { results: [], loading: false };
  }

  componentDidMount() {
    this.runSearch(this.props.query);
  }

  componentDidUpdate(prevProps: SearchBoxProps) {
    if (prevProps.query !== this.props.query) {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.runSearch(this.props.query);
      }, 300);
    }
  }

  componentWillUnmount() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  runSearch = async (query: string) => {
    this.setState({ loading: true });
    const results = query ? [`${query}-result-1`, `${query}-result-2`] : [];
    this.setState({ results, loading: false });
    this.props.onResultsChange(results);
  };

  render() {
    return (
      <div>
        {this.state.loading ? <span>Loading...</span> : null}
        <ul>
          {this.state.results.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    );
  }
}

export default SearchBox;
