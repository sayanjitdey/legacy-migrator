import React from "react";

interface CounterProps {
  step: number;
}

interface CounterState {
  count: number;
}

class Counter extends React.Component<CounterProps, CounterState> {
  constructor(props: CounterProps) {
    super(props);
    this.state = { count: 0 };
  }

  componentDidMount() {
    console.log("Counter mounted");
  }

  increment = () => {
    this.setState({ count: this.state.count + this.props.step });
  };

  render() {
    return (
      <div>
        <p>Count: {this.state.count}</p>
        <button onClick={this.increment}>Add</button>
      </div>
    );
  }
}

export default Counter;
