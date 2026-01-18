# Contributing to LLMos

Thanks for your interest in contributing to LLMos! We're building an OS for physical AI agents, and we'd love your help.

## 🎯 Project Vision

LLMos makes robotics accessible through natural language. Our goal: anyone should be able to build robots by just describing what they want.

## 🚀 Development Status

We're currently in **Phase 1** (Foundation). Check the [ROADMAP.md](ROADMAP.md) for our development plan.

**Current Focus**: Desktop-first experience with ESP32 support

## 🛠️ How to Contribute

### For Developers

#### 1. Core Development
Help build the main LLMos application:

**Good First Issues**:
- Bug fixes in the desktop app
- UI/UX improvements
- Error handling and user feedback
- Documentation improvements

**How to start**:
```bash
# Fork the repo
git clone https://github.com/YOUR_USERNAME/llmos
cd llmos

# Install dependencies
npm install

# Run in development
npm run dev            # Web mode
npm run electron:dev   # Desktop mode

# Make your changes
git checkout -b feature/your-feature-name

# Test your changes
npm run build
npm run electron:compile

# Submit PR
```

#### 2. Plugin Development
Build support for new hardware or capabilities:

**Plugin Ideas**:
- Arduino board support
- Raspberry Pi support
- Camera/vision integration
- Voice control
- New sensor types
- Custom robot behaviors

**Plugin Structure**:
```
plugins/
  └── your-plugin-name/
      ├── manifest.json      # Plugin metadata
      ├── README.md          # Documentation
      ├── agent.md           # Agent definition (optional)
      ├── tools.ts           # Custom tools
      └── firmware/          # Firmware files (optional)
```

**manifest.json** example:
```json
{
  "name": "my-hardware-plugin",
  "version": "1.0.0",
  "description": "Support for XYZ hardware",
  "author": "Your Name",
  "type": "hardware",
  "provides": {
    "agents": ["MyHardwareAgent"],
    "tools": ["connect-device", "flash-firmware"],
    "hardware": ["DeviceType"]
  },
  "dependencies": {
    "llm": ">=sonnet-3.5"
  }
}
```

#### 3. Documentation
Help others learn and use LLMos:

- Improve getting started guides
- Add tutorials for common projects
- Document APIs and plugin development
- Create video tutorials
- Write blog posts

### For Makers

#### 1. Build & Share
- Build robots using LLMos
- Share your projects in Discussions
- Write about your experience
- Create example projects

#### 2. Test & Report
- Test on different hardware
- Report bugs with details
- Suggest improvements
- Help other makers troubleshoot

#### 3. Community Support
- Answer questions in Discussions
- Share tips and tricks
- Contribute to wiki
- Help newcomers get started

### For Hardware Experts

#### 1. Hardware Plugins
- Add support for new boards
- Create sensor libraries
- Optimize firmware
- Test on real hardware

#### 2. Firmware Development
- Improve robot behaviors
- Optimize performance
- Add new capabilities
- Port to new platforms

## 📋 Development Guidelines

### Code Style
- TypeScript for all new code
- Use existing ESLint/Prettier config
- Follow React best practices
- Keep functions small and focused

### Git Workflow
```bash
# Always branch from main
git checkout main
git pull origin main
git checkout -b feature/my-feature

# Make atomic commits
git commit -m "feat: add distance sensor support"

# Push and create PR
git push origin feature/my-feature
```

### Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix a bug
docs: documentation changes
style: formatting, no code change
refactor: code restructuring
test: add tests
chore: maintenance tasks
```

### Pull Requests

**Before submitting**:
- [ ] Code builds without errors
- [ ] Functionality tested locally
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow convention
- [ ] Branch is up to date with main

**PR Template**:
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Plugin

## Testing
How you tested this

## Screenshots (if UI changes)
Before/after screenshots
```

### Code Review Process
1. Submit PR
2. Automated checks run
3. Maintainer reviews
4. Address feedback
5. Approved & merged

## 🎯 Areas We Need Help

### High Priority
- [ ] ESP32 one-click flashing
- [ ] Plugin system implementation
- [ ] Error handling improvements
- [ ] Hardware auto-detection
- [ ] Windows/Linux support

### Medium Priority
- [ ] Visual simulation
- [ ] Auto-debug features
- [ ] Community plugin examples
- [ ] Documentation improvements
- [ ] Example robot projects

### Good for Beginners
- [ ] UI polish
- [ ] Error message improvements
- [ ] Documentation fixes
- [ ] Example projects
- [ ] Testing on hardware

## 🐛 Reporting Bugs

**Good bug reports include**:
1. **Description**: What went wrong?
2. **Steps to reproduce**: How to trigger it?
3. **Expected behavior**: What should happen?
4. **Actual behavior**: What actually happened?
5. **Environment**: OS, LLMos version, hardware
6. **Screenshots/logs**: Visual evidence

**Bug Report Template**:
```markdown
## Bug Description
Clear description of the bug

## To Reproduce
1. Step one
2. Step two
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: macOS 14.2
- LLMos Version: 0.1.0
- Hardware: ESP32-S3

## Logs/Screenshots
Paste relevant logs or add screenshots
```

## 💡 Feature Requests

**Before requesting**:
- Check if already requested in Issues
- Consider if it fits the project vision
- Think about who would use it

**Feature Request Template**:
```markdown
## Feature Description
What feature do you want?

## Use Case
Why is this useful?

## Proposed Solution
How might it work?

## Alternatives Considered
Other ways to solve this
```

## 🧪 Testing

### Manual Testing
```bash
# Run desktop app
npm run electron:dev

# Test with real hardware
# 1. Connect ESP32
# 2. Try: "Connect to my ESP32"
# 3. Try: "Make a wall avoiding robot"
# 4. Verify robot code generates
```

### Automated Tests (Future)
```bash
npm run test
npm run test:e2e
```

## 📚 Resources

### Documentation
- [ROADMAP.md](ROADMAP.md) - Development plan
- [README.md](README.md) - Getting started
- [docs/](docs/) - Detailed documentation

### Community
- [GitHub Discussions](https://github.com/EvolvingAgentsLabs/llmos/discussions)
- [GitHub Issues](https://github.com/EvolvingAgentsLabs/llmos/issues)

### External Resources
- [Electron Documentation](https://www.electronjs.org/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [ESP32 Documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/)

## 🎓 Learning Resources

### New to Robotics?
- [ESP32 Getting Started](docs/hardware/ESP32_GUIDE.md)
- [Robot Programming Basics](docs/architecture/ROBOT4_GUIDE.md)

### New to TypeScript?
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [React + TypeScript](https://react-typescript-cheatsheet.netlify.app/)

### New to Electron?
- [Electron Tutorial](https://www.electronjs.org/docs/latest/tutorial/tutorial-prerequisites)

## 🏆 Recognition

Contributors are recognized in:
- GitHub Contributors page
- Release notes
- Project documentation
- Community showcases

## ❓ Questions?

- **General**: Post in [Discussions](https://github.com/EvolvingAgentsLabs/llmos/discussions)
- **Bugs**: Open an [Issue](https://github.com/EvolvingAgentsLabs/llmos/issues)
- **Security**: Email security@llmos.dev (coming soon)

## 📜 Code of Conduct

### Our Pledge
We're committed to providing a welcoming and inspiring community for everyone.

### Standards
**Do**:
- Be respectful and inclusive
- Welcome newcomers
- Give constructive feedback
- Focus on what's best for the community

**Don't**:
- Use offensive language
- Troll or insult others
- Harass or discriminate
- Publish others' private information

### Enforcement
Violations can be reported to maintainers. We will review and take appropriate action.

## 📄 License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.

---

**Thank you for contributing to LLMos!** 🤖

Together, we're making robotics accessible to everyone.
