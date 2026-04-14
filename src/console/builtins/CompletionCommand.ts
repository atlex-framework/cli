import { Command } from '../Command.js'

export class CompletionCommand extends Command {
  public static override signature = 'completion {shell?}'
  public static override description = 'Generate shell completion scripts (bash/zsh/fish)'

  public constructor(private readonly getCommandNames: () => string[]) {
    super()
  }

  public handle(): void {
    const shell = (this.argument('shell') ?? 'zsh').toLowerCase()
    const commands = this.getCommandNames().sort()

    if (shell === 'bash') {
      this.line(this.bash(commands))
      return
    }
    if (shell === 'fish') {
      this.line(this.fish(commands))
      return
    }
    // default: zsh
    this.line(this.zsh(commands))
  }

  private bash(commands: readonly string[]): string {
    const list = commands.map((c) => c.replace(/"/g, '\\"')).join(' ')
    return [
      '_atlex_completions() {',
      '  local cur prev',
      '  cur="${COMP_WORDS[COMP_CWORD]}"',
      '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
      `  local cmds="${list}"`,
      '  COMPREPLY=( $(compgen -W "$cmds" -- "$cur") )',
      '}',
      'complete -F _atlex_completions atlex',
      '',
    ].join('\n')
  }

  private zsh(commands: readonly string[]): string {
    const lines = commands.map((c) => `  '${c}:Atlex command' \\`).join('\n')
    return [
      '#compdef atlex',
      '',
      '_atlex() {',
      '  local -a commands',
      '  commands=(',
      lines,
      '  )',
      "  _describe -t commands 'atlex commands' commands",
      '}',
      '',
      '_atlex "$@"',
      '',
    ].join('\n')
  }

  private fish(commands: readonly string[]): string {
    return commands.map((c) => `complete -c atlex -f -a ${JSON.stringify(c)}`).join('\n') + '\n'
  }
}
