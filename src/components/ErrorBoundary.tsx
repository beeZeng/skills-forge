import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Nexus]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#0F1115] px-6 text-[#E8ECF4]">
          <div className="text-base font-semibold">界面渲染失败</div>
          <pre className="max-w-[640px] overflow-auto rounded-lg border border-[#2A3140] bg-[#171A21] p-4 text-xs text-[#F5A524]">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="rounded-lg bg-[#7C6CFF] px-4 py-2 text-sm text-white"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
