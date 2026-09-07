import React from "react";

interface ModalProps {
  title: string;
}

interface ModalState {
  isOpen: boolean;
}

class Modal extends React.Component<ModalProps, ModalState> {
  private dialogRef = React.createRef<HTMLDivElement>();

  constructor(props: ModalProps) {
    super(props);
    this.state = { isOpen: false };
  }

  // Exposed imperatively - parent components call modalRef.current.open()
  open = () => {
    this.setState({ isOpen: true });
    if (this.dialogRef.current) {
      this.dialogRef.current.focus();
    }
  };

  close = () => {
    this.setState({ isOpen: false });
  };

  shouldComponentUpdate(nextProps: ModalProps, nextState: ModalState) {
    return nextState.isOpen !== this.state.isOpen || nextProps.title !== this.props.title;
  }

  render() {
    if (!this.state.isOpen) return null;
    return (
      <div ref={this.dialogRef} tabIndex={-1}>
        <h2>{this.props.title}</h2>
        <button onClick={this.close}>Close</button>
      </div>
    );
  }
}

// HOC wrapping - migration needs to account for this
function withLogging<P>(Component: React.ComponentType<P>) {
  return class extends React.Component<P> {
    componentDidMount() {
      console.log("Wrapped component mounted");
    }
    render() {
      return <Component {...this.props} />;
    }
  };
}

export default withLogging(Modal);
