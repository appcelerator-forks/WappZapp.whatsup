exports.definition = {
  config: {
    URL: 'http://dev.fokkezb.nl/wa',
    debug: true,
    adapter: {
      type: 'restapi'
    }
  },
  extendModel: function(Model) {
    _.extend(Model.prototype, {
      initialize: function(options) {
        //return Alloy.Collections.instance('List').add(this);
      }
    });
    return Model;
  }
};