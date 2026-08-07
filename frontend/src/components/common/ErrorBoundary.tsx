import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  message?: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : 'Something went wrong' }
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('[UCRIP] Error boundary caught:', error, info)
  }

  private handleReset = () => this.setState({ hasError: false, message: undefined })

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <div>
              <h2 className="text-slate-900 font-semibold text-lg">Something went wrong</h2>
              <p className="text-slate-500 text-sm mt-1 break-words">
                {this.state.message || 'An unexpected error occurred.'}
              </p>
            </div>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
            >
              Reload
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
