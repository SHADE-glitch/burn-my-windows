# Build rules for the Burn-My-Windows fork.
#
# The compiled GResource bundle and gschemas.compiled are committed to the
# repository, because a local GNOME Shell extension is used in place and has no
# install step. Run `make` after editing anything under resources/ or schemas/.

NAME     := burn-my-windows
MANIFEST := resources/$(NAME).gresource.xml
BUNDLE   := resources/$(NAME).gresource

# Every <file> entry of the manifest, as a path relative to the repository root.
# These are listed as prerequisites so that editing a shader, a .ui file or an
# image rebuilds the bundle; depending on the manifest alone would not, because
# editing a source file does not touch the manifest.
SOURCES := $(shell sed -n 's|.*<file>\(.*\)</file>.*|resources/\1|p' $(MANIFEST))

.PHONY: all resources schemas
all: resources schemas

resources: $(BUNDLE)

# --sourcedir must be `resources`: it is the directory the <file> paths in the
# manifest are relative to, and it is what makes <file>shaders/foo.frag</file>
# resolve to /shaders/foo.frag at runtime. Using `.` here would produce
# /resources/shaders/foo.frag and break every resource lookup.
$(BUNDLE): $(MANIFEST) $(SOURCES)
	glib-compile-resources --sourcedir=resources --generate \
	    --target=$(BUNDLE) $(MANIFEST)

schemas:
	glib-compile-schemas schemas/
